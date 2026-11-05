import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { AllocatableSeat, SeatGroup } from '$lib/allocation';
import {
	ALREADY_DECIDED_REFUSAL,
	INTERNAL_NOTE_MAX_LENGTH,
	INTERNAL_NOTE_TOO_LONG_REFUSAL,
	REJECTED_FLASH,
	WAITLISTED_FLASH,
	type ApplicationForReview
} from '$lib/application-review';
import type { ApplicationStatus, OrganiserApplicationRow } from '$lib/applications';
import type { Conference } from '$lib/conferences';
import type { CommitteeWithSeats } from '$lib/server/committees';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the nine actions themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/applications`, `$lib/allocation` and `$lib/urls` are deliberately not
// stood in for: they are pure, and running the real ones is what proves this
// page, the seat suggestions and the addresses all agree with each other.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/application-table', () => ({
	countApplicationsByStatus: vi.fn(),
	listApplications: vi.fn()
}));

vi.mock('$lib/server/application-board', () => ({ listApplicationBoard: vi.fn() }));

vi.mock('$lib/server/application-bulk-decisions', () => ({
	rejectApplications: vi.fn(),
	waitlistApplications: vi.fn()
}));

vi.mock('$lib/server/committees', () => ({ listCommitteesWithSeatCounts: vi.fn() }));

vi.mock('$lib/server/seat-acceptance', () => ({
	acceptApplication: vi.fn(),
	listFreeSeats: vi.fn(),
	listSeatsByCommittee: vi.fn()
}));

// The review panel reads one application the way the review page does.
vi.mock('$lib/server/application-review', () => ({
	getApplicationForReview: vi.fn(),
	updateApplicationInternalNote: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

vi.mock('$lib/server/application-teams', () => ({ listTeamMembers: vi.fn() }));

import { requireManagePage, requirePermission } from '$lib/server/access';
import { listApplicationBoard } from '$lib/server/application-board';
import { rejectApplications, waitlistApplications } from '$lib/server/application-bulk-decisions';
import {
	getApplicationForReview,
	updateApplicationInternalNote
} from '$lib/server/application-review';
import { countApplicationsByStatus, listApplications } from '$lib/server/application-table';
import { listTeamMembers } from '$lib/server/application-teams';
import { ACCEPT_TEAM_ON_REVIEW_PAGE_REFUSAL } from '$lib/application-teams';
import { listCommitteesWithSeatCounts } from '$lib/server/committees';
import { setFlash } from '$lib/server/flash';
import {
	acceptApplication,
	listFreeSeats,
	listSeatsByCommittee
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

/** The organiser every action here runs as. Their id is what `decided_by` gets. */
const SIGNED_IN_USER = { id: 'user-organiser', email: 'daniel@example.com' };

/** The conference. Only its id and its slug are read. */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Warsaw'
} as unknown as Conference;

/** The page every action comes back to, and the address they are all posted to. */
const APPLICATIONS_PATH = '/manage/riverside-mun-2027/applications';

/** A committee as the list query answers with it: the committee, plus seat counts nobody here reads. */
function committeeWithSeats(id: string, name: string, abbreviation: string): CommitteeWithSeats {
	return {
		committee: { id, name, abbreviation },
		seatSummary: { taken: 0, total: 0 }
	} as unknown as CommitteeWithSeats;
}

const SECURITY_COUNCIL = committeeWithSeats(
	'committee-unsc',
	'United Nations Security Council',
	'UNSC'
);

const HUMAN_RIGHTS = committeeWithSeats('committee-unhrc', 'Human Rights Council', 'UNHRC');

const COMMITTEES = [SECURITY_COUNCIL, HUMAN_RIGHTS];

/** A seat nobody holds, which the accept panel may offer. */
function freeSeat(id: string, committeeId: string, name: string): AllocatableSeat {
	return {
		id,
		committeeId,
		name,
		countryCode: null,
		isAvailable: true,
		delegationId: null,
		userId: null
	};
}

const FRANCE = freeSeat('seat-france', SECURITY_COUNCIL.committee.id, 'France');
const BRAZIL = freeSeat('seat-brazil', SECURITY_COUNCIL.committee.id, 'Brazil');
const NORWAY = freeSeat('seat-norway', HUMAN_RIGHTS.committee.id, 'Norway');

const FREE_SEATS = [FRANCE, BRAZIL, NORWAY];

/**
 * One row of the organiser's table. Only the fields the actions read are varied.
 *
 * `preferred` is the committee the applicant asked for first, which is what
 * lifts that committee's seats to the top of their dropdown. The row carries
 * both halves of it, as `listApplications` fills them in: the id, which
 * `suggestSeats` orders by, and the heading, which the table prints.
 */
function applicationRow(id: string, applicantName: string, preferred: CommitteeWithSeats | null) {
	return {
		id,
		applicantName,
		avatarPath: null,
		institutionName: 'Lyceum 7',
		countryCode: 'PL',
		experienceLevel: 'intermediate',
		firstPreference: preferred === null ? null : preferred.committee.abbreviation,
		committeePreferences: preferred === null ? [] : [preferred.committee.id],
		status: 'submitted',
		submittedAt: '2026-10-03T09:00:00+00:00',
		decidedAt: null,
		seatLabel: null
	} satisfies OrganiserApplicationRow;
}

const ANNA = applicationRow('application-anna', 'Anna Kowalski', SECURITY_COUNCIL);
const BEN = applicationRow('application-ben', 'Ben Adeyemi', HUMAN_RIGHTS);
const CARLA = applicationRow('application-carla', 'Carla Rossi', null);

/** The page of rows the table is showing. The actions look the ticked ids up in it. */
const ROWS = [ANNA, BEN, CARLA];

/** What the tab strip is told, and what `countApplicationsByStatus` answers with. */
const STATUS_COUNTS = {
	submitted: 3,
	waitlisted: 0,
	accepted: 0,
	rejected: 0,
	withdrawn: 0
};

/** France on the Security Council, the one seat the review panel offers. */
const PANEL_SEAT_GROUPS: SeatGroup[] = [
	{ committeeId: SECURITY_COUNCIL.committee.id, committeeLabel: 'UNSC', seats: [FRANCE] }
];

/**
 * One row read the way the review page reads it, which is what the review
 * panel draws and what its actions decide. `submitted` unless a test says.
 */
function reviewOf(row: OrganiserApplicationRow, status: ApplicationStatus = 'submitted') {
	return {
		application: {
			id: row.id,
			conferenceId: CONFERENCE.id,
			status,
			committeePreferences: row.committeePreferences,
			seatPreferences: null,
			motivation: 'I love debating.',
			answers: {},
			submittedAt: row.submittedAt,
			decidedAt: null,
			decisionNote: null,
			internalNote: 'Strong writer.'
		},
		profile: {
			userId: 'user-applicant',
			fullName: row.applicantName,
			avatarPath: null,
			institutionName: row.institutionName,
			countryCode: row.countryCode,
			experienceLevel: 'intermediate'
		},
		details: null,
		questions: [],
		preferredCommittees: [],
		seat: null,
		invoice: null
	} satisfies ApplicationForReview;
}

/** The board's columns, as `listApplicationBoard` answers with them. */
const BOARD_COLUMNS = [
	{ status: 'submitted' as const, rows: ROWS, total: 3 },
	{ status: 'waitlisted' as const, rows: [], total: 0 },
	{ status: 'accepted' as const, rows: [], total: 0 },
	{ status: 'rejected' as const, rows: [], total: 0 }
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
		url: new URL(`http://localhost${APPLICATIONS_PATH}`),
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
 * the `?status=`, `?q=` and the rest that the tabs and the filters put in the
 * address.
 */
function makeLoadEvent(
	search: string = '',
	permissions: MyPermissions = ADMINISTRATOR
): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${APPLICATIONS_PATH}${search}`),
		parent: async () => ({ conference: CONFERENCE, permissions })
	}) as unknown as PageServerLoadEvent;
}

/**
 * A post carrying these fields to one of the actions.
 *
 * `ids` is a list rather than one value, because the tick boxes all share that
 * name and the browser sends one entry per ticked box. `search` is the filters
 * the organiser had open, which SvelteKit leaves in the address of a form post.
 */
function makeActionEvent(
	ids: string[],
	fields: Record<string, string> = {},
	search: string = ''
): RequestEvent {
	const formData = new FormData();

	for (const id of ids) {
		formData.append('ids', id);
	}

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${APPLICATIONS_PATH}${search}`),
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

/** What an action answers with, whether it refused with `fail` or returned plainly. */
type ActionResult = {
	status?: number;
	data?: {
		panel?: 'accept' | 'reject' | null;
		selected?: OrganiserApplicationRow[];
		message?: string | null;
		decisionNote?: string;
		seatChoices?: Record<string, string>;
	};
	panel?: 'accept' | 'reject' | null;
	selected?: OrganiserApplicationRow[];
	suggestions?: { committeeId: string; committeeLabel: string; seats: AllocatableSeat[] }[][];
};

/** The message the flash cookie was given, whichever action wrote it. */
function flashMessage(): string {
	return vi.mocked(setFlash).mock.calls[0][1].message;
}

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(listApplications).mockResolvedValue({ rows: ROWS, total: 3 });
	vi.mocked(countApplicationsByStatus).mockResolvedValue(STATUS_COUNTS);
	vi.mocked(listCommitteesWithSeatCounts).mockResolvedValue(COMMITTEES);
	vi.mocked(listFreeSeats).mockResolvedValue(FREE_SEATS);
	vi.mocked(waitlistApplications).mockResolvedValue({ changedCount: 3, skippedCount: 0 });
	vi.mocked(rejectApplications).mockResolvedValue({ changedCount: 3, skippedCount: 0 });
	vi.mocked(acceptApplication).mockResolvedValue(undefined);
	vi.mocked(listApplicationBoard).mockResolvedValue(BOARD_COLUMNS);
	vi.mocked(listSeatsByCommittee).mockResolvedValue(PANEL_SEAT_GROUPS);
	vi.mocked(updateApplicationInternalNote).mockResolvedValue(undefined);
	vi.mocked(listTeamMembers).mockResolvedValue([]);
	vi.mocked(getApplicationForReview).mockImplementation(async (_supabase, _conferenceId, id) => {
		const row = ROWS.find((candidate) => candidate.id === id);

		return row === undefined ? null : reviewOf(row);
	});
});

describe('load', () => {
	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermission).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'applications');
		expect(listApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ status: 'submitted', page: 1 })
		);
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('tells the page whether the reader may decide, so a reader sees no forms', async () => {
		expect(await load(makeLoadEvent(undefined, ADMINISTRATOR))).toMatchObject({ canDecide: true });
		expect(await load(makeLoadEvent(undefined, READER))).toMatchObject({ canDecide: false });
	});

	it('hands the page the rows and the counts on the tabs', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ rows: ROWS, counts: STATUS_COUNTS });
	});

	it('hands the page no free seats, because nothing on it draws them', async () => {
		const result = await load(makeLoadEvent());

		// Only the seat panel needs them, and that panel is only ever drawn as an
		// action's answer, so the action reads them then. A `load` sending down a
		// list nothing draws is something the next reader has to check before they
		// can change it.
		expect(result).not.toHaveProperty('freeSeats');
		expect(listFreeSeats).not.toHaveBeenCalled();
	});

	it('reads the whole list state out of the address', async () => {
		const result = await load(makeLoadEvent('?status=accepted&q=anna&sort=name&page=2'));

		expect(result).toMatchObject({
			query: expect.objectContaining({ status: 'accepted', q: 'anna', sort: 'name', page: 2 })
		});
	});

	it('drops the seat counts the committee query brings along', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			committees: [
				{ id: 'committee-unsc', name: 'United Nations Security Council', abbreviation: 'UNSC' },
				{ id: 'committee-unhrc', name: 'Human Rights Council', abbreviation: 'UNHRC' }
			]
		});
	});

	it('counts the pages of twenty-five', async () => {
		vi.mocked(listApplications).mockResolvedValue({ rows: ROWS, total: 51 });

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ pageCount: 3 });
	});

	it('reads no board while the table is the view on screen', async () => {
		const result = await load(makeLoadEvent());

		expect(listApplicationBoard).not.toHaveBeenCalled();
		expect(result).toMatchObject({ boardColumns: [] });
	});

	it('hands the board its columns, read with the filters in the address', async () => {
		const result = await load(makeLoadEvent('?view=board&q=anna'));

		expect(listApplicationBoard).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ view: 'board', q: 'anna' })
		);
		expect(result).toMatchObject({ boardColumns: BOARD_COLUMNS });
	});

	it('says one page even when nobody has applied, rather than none', async () => {
		vi.mocked(listApplications).mockResolvedValue({ rows: [], total: 0 });

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ pageCount: 1 });
	});
});

describe('load, for the review panel beside the table', () => {
	it('draws the first row when the address names no application', async () => {
		const result = await load(makeLoadEvent());

		expect(getApplicationForReview).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, ANNA.id);
		expect(result).toMatchObject({
			reviewPanel: {
				applicationId: ANNA.id,
				applicantName: 'Anna Kowalski',
				metaLine: 'Applied 3 October · 1 of 3',
				seatOptions: [{ value: FRANCE.id, label: 'UNSC · France' }],
				links: { previousHref: null, nextHref: `${APPLICATIONS_PATH}?application=${BEN.id}` }
			}
		});
	});

	it('draws the application the address names, keeping the tab in its links', async () => {
		const result = await load(makeLoadEvent(`?status=waitlisted&application=${BEN.id}`));

		expect(result).toMatchObject({
			reviewPanel: {
				applicationId: BEN.id,
				links: {
					previousHref: `${APPLICATIONS_PATH}?status=waitlisted&application=${ANNA.id}`,
					acceptAction: `${APPLICATIONS_PATH}?status=waitlisted&application=${BEN.id}&/reviewAccept`
				}
			}
		});
	});

	it('has no panel on the board, or on a tab with nobody in it', async () => {
		const board = await load(makeLoadEvent('?view=board'));

		vi.mocked(listApplications).mockResolvedValue({ rows: [], total: 0 });
		const empty = await load(makeLoadEvent());

		expect(board).toMatchObject({ reviewPanel: null });
		expect(empty).toMatchObject({ reviewPanel: null });
	});
});

describe('every action', () => {
	it('asks the organiser gate again, because an action is its own request', async () => {
		await actions.chooseAccept(makeActionEvent([ANNA.id]));
		await actions.chooseReject(makeActionEvent([ANNA.id]));
		await catchRedirect(() => actions.bulkWaitlist(makeActionEvent([ANNA.id])));
		await catchRedirect(() => actions.bulkReject(makeActionEvent([ANNA.id])));
		await catchRedirect(() =>
			actions.bulkAccept(makeActionEvent([ANNA.id], { [`seat:${ANNA.id}`]: FRANCE.id }))
		);

		expect(requirePermission).toHaveBeenCalledTimes(5);
		expect(vi.mocked(requirePermission).mock.calls.map((call) => call[3])).toEqual(
			Array(5).fill('decide_applications')
		);
	});

	it('asks the gate again for every post from the review panel too', async () => {
		const search = `?application=${ANNA.id}`;

		await catchRedirect(() =>
			actions.reviewAccept(makeActionEvent([], { seatId: FRANCE.id }, search))
		);
		await catchRedirect(() => actions.reviewWaitlist(makeActionEvent([], {}, search)));
		await catchRedirect(() => actions.reviewReject(makeActionEvent([], {}, search)));
		await catchRedirect(() => actions.reviewSaveNote(makeActionEvent([], {}, search)));

		expect(requirePermission).toHaveBeenCalledTimes(4);
	});

	it('refuses when nothing is ticked, and writes nothing', async () => {
		const accept = (await actions.chooseAccept(makeActionEvent([]))) as ActionResult;
		const waitlist = (await actions.bulkWaitlist(makeActionEvent([]))) as ActionResult;

		expect(accept.status).toBe(400);
		expect(accept.data?.message).toBe('Tick the applications you want to accept.');
		expect(waitlist.status).toBe(400);
		expect(waitlistApplications).not.toHaveBeenCalled();
	});
});

describe('the ticked ids', () => {
	/*
		The page draws the same rows twice — a table from `md` up and cards below
		it — and a hidden tick box is submitted exactly as a visible one is, so
		every ticked application arrives twice.
	*/
	it('are counted once even though every row is submitted twice', async () => {
		await catchRedirect(() =>
			actions.bulkWaitlist(makeActionEvent([ANNA.id, BEN.id, ANNA.id, BEN.id]))
		);

		expect(waitlistApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[ANNA.id, BEN.id],
			SIGNED_IN_USER.id,
			null
		);
	});

	it('are put back into the table’s order, not the order they arrived in', async () => {
		const result = (await actions.chooseReject(
			makeActionEvent([CARLA.id, ANNA.id, CARLA.id])
		)) as ActionResult;

		expect(result.selected).toEqual([ANNA, CARLA]);
	});
});

describe('the chooseAccept action', () => {
	it('opens the seat panel without writing anything', async () => {
		const result = (await actions.chooseAccept(makeActionEvent([ANNA.id, BEN.id]))) as ActionResult;

		expect(result.panel).toBe('accept');
		expect(result.selected).toEqual([ANNA, BEN]);
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('offers each applicant their first preference first', async () => {
		const result = (await actions.chooseAccept(makeActionEvent([ANNA.id, BEN.id]))) as ActionResult;

		// Anna asked for UNSC, so its free seats are the first group she is shown;
		// Ben asked for UNHRC, so his order is the other way round.
		expect(result.suggestions?.[0].map((group) => group.committeeLabel)).toEqual(['UNSC', 'UNHRC']);
		expect(result.suggestions?.[1].map((group) => group.committeeLabel)).toEqual(['UNHRC', 'UNSC']);
	});
});

describe('Accept… and Reject… with nobody left to decide', () => {
	/*
		A drag on the board ticks one application. When the applicant withdrew,
		or another organiser decided it, after the board was drawn, it has left
		its tab, and a panel for nobody would be no answer at all (T135).
	*/
	it('refuses instead of opening a panel for nobody', async () => {
		const accept = (await actions.chooseAccept(makeActionEvent(['gone']))) as ActionResult;
		const reject = (await actions.chooseReject(makeActionEvent(['gone']))) as ActionResult;

		expect(accept.status).toBe(409);
		expect(accept.data?.message).toBe('Nothing changed. 1 was already decided.');
		expect(accept.data?.panel).toBeNull();
		expect(reject.status).toBe(409);
		expect(reject.data?.message).toBe('Nothing changed. 1 was already decided.');
	});

	it('still opens the panel for whoever is left', async () => {
		const result = (await actions.chooseReject(makeActionEvent(['gone', ANNA.id]))) as ActionResult;

		expect(result.panel).toBe('reject');
		expect(result.selected).toEqual([ANNA]);
	});
});

describe('the bulkWaitlist action', () => {
	it('comes back to the board when the drop came from the board', async () => {
		const redirect = await catchRedirect(() =>
			actions.bulkWaitlist(makeActionEvent([ANNA.id], {}, '?view=board'))
		);

		expect(redirect.location).toBe(`${APPLICATIONS_PATH}?view=board`);
	});

	it('goes back to the same tab, filters and page, so the decision does not lose them', async () => {
		const redirect = await catchRedirect(() =>
			actions.bulkWaitlist(makeActionEvent([ANNA.id], {}, '?status=waitlisted&q=anna&page=2'))
		);

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(
			'/manage/riverside-mun-2027/applications?q=anna&status=waitlisted&page=2'
		);
	});

	it('says how many moved and how many were already decided', async () => {
		vi.mocked(waitlistApplications).mockResolvedValue({ changedCount: 4, skippedCount: 2 });

		await catchRedirect(() => actions.bulkWaitlist(makeActionEvent([ANNA.id, BEN.id])));

		expect(flashMessage()).toBe('4 waitlisted, 2 skipped because they were already decided.');
	});

	it('refuses with one sentence and a log when the database fails', async () => {
		vi.mocked(waitlistApplications).mockRejectedValue(new Error('connection lost'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = (await actions.bulkWaitlist(makeActionEvent([ANNA.id]))) as ActionResult;

		expect(result.status).toBe(500);
		expect(result.data?.message).toBe('Nothing was changed. Please try again.');
		expect(logged).toHaveBeenCalled();

		logged.mockRestore();
	});
});

describe('the bulkReject action', () => {
	it('writes the same note on every ticked application', async () => {
		await catchRedirect(() =>
			actions.bulkReject(
				makeActionEvent([ANNA.id, BEN.id], { decisionNote: 'We were oversubscribed.' })
			)
		);

		expect(rejectApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[ANNA.id, BEN.id],
			SIGNED_IN_USER.id,
			'We were oversubscribed.'
		);
		expect(flashMessage()).toBe('3 applications marked as not accepted.');
	});

	/* An empty box is `null` and not `''`, so a note somebody already wrote is
	   left alone rather than being blanked over. */
	it('sends no note at all when the box was left empty', async () => {
		await catchRedirect(() => actions.bulkReject(makeActionEvent([ANNA.id])));

		expect(rejectApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[ANNA.id],
			SIGNED_IN_USER.id,
			null
		);
	});

	it('refuses a note longer than the box allows, and keeps what was typed', async () => {
		const tooLong = 'x'.repeat(501);

		const result = (await actions.bulkReject(
			makeActionEvent([ANNA.id], { decisionNote: tooLong })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.panel).toBe('reject');
		expect(result.data?.decisionNote).toBe(tooLong);
		expect(rejectApplications).not.toHaveBeenCalled();
	});
});

describe('the bulkAccept action', () => {
	/** The seat each of the three was given, as the panel's dropdowns submit them. */
	const SEAT_FIELDS = {
		[`seat:${ANNA.id}`]: FRANCE.id,
		[`seat:${BEN.id}`]: NORWAY.id
	};

	it('accepts one at a time, in the order the table draws them', async () => {
		await catchRedirect(() => actions.bulkAccept(makeActionEvent([BEN.id, ANNA.id], SEAT_FIELDS)));

		expect(vi.mocked(acceptApplication).mock.calls).toEqual([
			[SUPABASE, ANNA.id, FRANCE.id],
			[SUPABASE, BEN.id, NORWAY.id]
		]);
		expect(flashMessage()).toBe('2 applications accepted.');
	});

	/* The other two bulk decisions get their skipped count from the database,
	   which sees every id they send. This one cannot: a row another organiser
	   decided a moment ago has left the tab by the time the page is read again,
	   so it never reaches the loop and has to be counted here instead. */
	it('counts a ticked applicant who has left the tab as skipped', async () => {
		// Ben was decided by somebody else, so the tab now holds Anna alone.
		vi.mocked(listApplications).mockResolvedValue({ rows: [ANNA], total: 1 });

		await catchRedirect(() => actions.bulkAccept(makeActionEvent([ANNA.id, BEN.id], SEAT_FIELDS)));

		expect(vi.mocked(acceptApplication).mock.calls).toEqual([[SUPABASE, ANNA.id, FRANCE.id]]);
		expect(flashMessage()).toBe('1 accepted, 1 skipped because it was already decided.');
	});

	it('says so when every ticked applicant was decided by somebody else first', async () => {
		vi.mocked(listApplications).mockResolvedValue({ rows: [CARLA], total: 1 });

		await catchRedirect(() => actions.bulkAccept(makeActionEvent([ANNA.id, BEN.id], SEAT_FIELDS)));

		expect(acceptApplication).not.toHaveBeenCalled();
		expect(flashMessage()).toBe('Nothing changed. 2 were already decided.');
	});

	it('refuses until every ticked applicant has a seat, keeping the dropdowns', async () => {
		const result = (await actions.bulkAccept(
			makeActionEvent([ANNA.id, BEN.id], { [`seat:${ANNA.id}`]: FRANCE.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.panel).toBe('accept');
		expect(result.data?.message).toBe(
			'Choose a seat for every applicant, or untick the ones you are not ready to accept.'
		);
		expect(result.data?.seatChoices).toEqual({ [ANNA.id]: FRANCE.id, [BEN.id]: '' });
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('refuses the same seat twice, and names it', async () => {
		const result = (await actions.bulkAccept(
			makeActionEvent([ANNA.id, BEN.id], {
				[`seat:${ANNA.id}`]: FRANCE.id,
				[`seat:${BEN.id}`]: FRANCE.id
			})
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('France was chosen twice.');
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('stops at the first refusal, keeps what it already did, and says where it stopped', async () => {
		vi.mocked(acceptApplication)
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('That seat is not free'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await catchRedirect(() =>
			actions.bulkAccept(
				makeActionEvent([ANNA.id, BEN.id, CARLA.id], {
					[`seat:${ANNA.id}`]: FRANCE.id,
					[`seat:${BEN.id}`]: NORWAY.id,
					[`seat:${CARLA.id}`]: BRAZIL.id
				})
			)
		);

		// Anna is accepted and stays accepted; Carla is never reached.
		expect(acceptApplication).toHaveBeenCalledTimes(2);
		expect(flashMessage()).toBe('1 accepted. Stopped at Ben Adeyemi: that seat was just taken.');
		expect(logged).toHaveBeenCalled();

		logged.mockRestore();
	});

	/* Every other reason `accept_application` raises is a sentence of its own,
	   written for an organiser, and they are shown it as it is rather than
	   being told about seats. */
	it('passes on the other sentences the function itself raises', async () => {
		vi.mocked(acceptApplication).mockRejectedValue(
			new Error('Only a submitted or waitlisted application can be accepted')
		);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await catchRedirect(() =>
			actions.bulkAccept(makeActionEvent([ANNA.id], { [`seat:${ANNA.id}`]: FRANCE.id }))
		);

		expect(flashMessage()).toBe(
			'0 accepted. Stopped at Anna Kowalski: Only a submitted or waitlisted application can be accepted'
		);

		logged.mockRestore();
	});

	/* A failure of any other kind is somebody else's text, and
	   `03-design/writing-style.md` says never to put one on the screen. */
	it('logs a failure nobody wrote for an organiser instead of showing it', async () => {
		vi.mocked(acceptApplication).mockRejectedValue(new Error('fetch failed'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await catchRedirect(() =>
			actions.bulkAccept(makeActionEvent([ANNA.id], { [`seat:${ANNA.id}`]: FRANCE.id }))
		);

		expect(flashMessage()).toBe(
			'0 accepted. Stopped at Anna Kowalski: something went wrong on our side. Please try again.'
		);
		expect(logged).toHaveBeenCalled();
		expect(flashMessage()).not.toContain('fetch failed');

		logged.mockRestore();
	});
});

describe('the review panel’s actions', () => {
	it('accept the panel’s application into the chosen seat, and move on to the next row', async () => {
		const redirect = await catchRedirect(() =>
			actions.reviewAccept(
				makeActionEvent([], { seatId: FRANCE.id }, `?status=submitted&application=${ANNA.id}`)
			)
		);

		expect(acceptApplication).toHaveBeenCalledWith(SUPABASE, ANNA.id, FRANCE.id);
		expect(flashMessage()).toContain('Anna Kowalski');
		// The decided application has left the tab, so the panel opens on Ben,
		// and the redirect is to the list itself: the page does not change.
		expect(redirect).toEqual({
			status: 303,
			location: `${APPLICATIONS_PATH}?application=${BEN.id}`
		});
	});

	it('go back to the row before when the last row was decided', async () => {
		const redirect = await catchRedirect(() =>
			actions.reviewWaitlist(makeActionEvent([], {}, `?application=${CARLA.id}`))
		);

		expect(waitlistApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[CARLA.id],
			SIGNED_IN_USER.id,
			null
		);
		expect(flashMessage()).toBe(WAITLISTED_FLASH);
		expect(redirect.location).toBe(`${APPLICATIONS_PATH}?application=${BEN.id}`);
	});

	it('send the note typed in the dialog with "Decline"', async () => {
		await catchRedirect(() =>
			actions.reviewReject(
				makeActionEvent(
					[],
					{ decisionNote: ' The committees are full. ' },
					`?application=${BEN.id}`
				)
			)
		);

		expect(rejectApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[BEN.id],
			SIGNED_IN_USER.id,
			'The committees are full.'
		);
		expect(flashMessage()).toBe(REJECTED_FLASH);
	});

	it('refuse an application decided since, under the panel’s buttons, keeping the seat', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(reviewOf(ANNA, 'accepted'));

		const result = (await actions.reviewAccept(
			makeActionEvent([], { seatId: FRANCE.id }, `?application=${ANNA.id}`)
		)) as { status: number; data: { message: string | null; reviewPanel: unknown } };

		expect(result.status).toBe(400);
		expect(result.data.message).toBeNull();
		expect(result.data.reviewPanel).toEqual({
			applicationId: ANNA.id,
			part: 'decision',
			message: ALREADY_DECIDED_REFUSAL,
			seatId: FRANCE.id,
			internalNote: ''
		});
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('save the organisers’ note and stay on the same application', async () => {
		const redirect = await catchRedirect(() =>
			actions.reviewSaveNote(
				makeActionEvent([], { internalNote: 'Call back.' }, `?page=1&application=${BEN.id}`)
			)
		);

		expect(updateApplicationInternalNote).toHaveBeenCalledWith(SUPABASE, BEN.id, 'Call back.');
		expect(redirect.location).toBe(`${APPLICATIONS_PATH}?application=${BEN.id}`);
	});

	it('refuse a note that is too long, keeping what was typed', async () => {
		const tooLong = 'x'.repeat(INTERNAL_NOTE_MAX_LENGTH + 1);

		const result = (await actions.reviewSaveNote(
			makeActionEvent([], { internalNote: tooLong }, `?application=${BEN.id}`)
		)) as {
			status: number;
			data: { reviewPanel: { part: string; message: string; internalNote: string } };
		};

		expect(result.status).toBe(400);
		expect(result.data.reviewPanel).toMatchObject({
			part: 'note',
			message: INTERNAL_NOTE_TOO_LONG_REFUSAL,
			internalNote: tooLong
		});
	});

	it('answer 404 for a post naming no application, or one not of this conference', async () => {
		const unnamed = await catchRedirect(() => actions.reviewWaitlist(makeActionEvent([], {})));
		const elsewhere = await catchRedirect(() =>
			actions.reviewWaitlist(makeActionEvent([], {}, '?application=somebody-else'))
		);

		expect(unnamed.status).toBe(404);
		expect(elsewhere.status).toBe(404);
		expect(waitlistApplications).not.toHaveBeenCalled();
	});
});

/** Anna and Ben applied as one team (Trello pZNcdPqU). */
function teamOfAnnaAndBen() {
	vi.mocked(listTeamMembers).mockResolvedValue(
		[ANNA, BEN].map((row) => ({
			applicationId: row.id,
			userId: `user-${row.id}`,
			fullName: row.applicantName,
			status: 'submitted' as const,
			committeePreferences: []
		}))
	);
}

describe('the review panel and a team', () => {
	it('waitlists the undecided teammate along with the panel’s application', async () => {
		teamOfAnnaAndBen();

		await catchRedirect(() =>
			actions.reviewWaitlist(makeActionEvent([], {}, `?application=${ANNA.id}`))
		);

		expect(waitlistApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[ANNA.id, BEN.id],
			SIGNED_IN_USER.id,
			null
		);
	});

	it('gives no single seat to one member of a team', async () => {
		teamOfAnnaAndBen();

		const result = await actions.reviewAccept(
			makeActionEvent([], { seatId: FRANCE.id }, `?application=${ANNA.id}`)
		);

		expect(result).toMatchObject({
			data: { reviewPanel: { message: ACCEPT_TEAM_ON_REVIEW_PAGE_REFUSAL } }
		});
		expect(acceptApplication).not.toHaveBeenCalled();
	});
});
