import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ChairCommittee, ChairRoomFrame } from '$lib/chair-room';
import { NOTE_REFUSALS, type ChairNote, type SeatAllocation } from '$lib/chair-notes';
import type { RoomSeat } from '$lib/committee-room';
import type { Conference } from '$lib/conferences';
import { chairNoteAddedUrl, chairNotesUrl } from '$lib/urls';
import { NEW_ROW_ID_FIELD } from '$lib/new-row-id';

// The gate, the room's frame and the note queries are stood in for, so these
// tests are about what the page decides: which seat it shows, which refusal
// each rule answers with, what it writes and where it sends the chair back.
// The queries have their own tests in `src/lib/server/chair-notes.test.ts`,
// and the whole page runs against a real database in `tests/e2e/chair-notes.spec.ts`.
vi.mock('$lib/server/access', () => ({
	askHasPermission: vi.fn(),
	requireCommitteePermission: vi.fn(),
	requireCommitteeTool: vi.fn()
}));

vi.mock('$lib/server/committee-room', () => ({ getChairRoomFrame: vi.fn() }));

vi.mock('$lib/server/chair-notes', () => ({
	addChairNote: vi.fn(),
	deleteChairNote: vi.fn(),
	listChairNotes: vi.fn(),
	listSeatAllocations: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import {
	askHasPermission,
	requireCommitteePermission,
	requireCommitteeTool
} from '$lib/server/access';
import {
	addChairNote,
	deleteChairNote,
	listChairNotes,
	listSeatAllocations
} from '$lib/server/chair-notes';
import { getChairRoomFrame } from '$lib/server/committee-room';
import { setFlash } from '$lib/server/flash';

/** The Supabase client. The page only hands it on to the server modules above. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'unsc';
const NOTES_PATH = `/conferences/${CONFERENCE_SLUG}/committees/${COMMITTEE_SLUG}/chair/notes`;

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: COMMITTEE_SLUG,
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: 'Room 1',
	defaultSpeakingTimeSeconds: 60,
	topics: ['Climate finance']
};

/** Only the fields `load` and the actions read. */
const CONFERENCE = { id: 'conference-1', slug: CONFERENCE_SLUG } as Conference;

const SEAT_FR: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: null };
const SEAT_DE: RoomSeat = { id: 'seat-de', name: 'Germany', countryCode: 'DE', delegateName: 'Jo' };

/** France is empty, Germany has a delegate. */
const ALLOCATIONS: SeatAllocation[] = [
	{ seatId: 'seat-fr', isFilled: false, allocatedAt: null },
	{ seatId: 'seat-de', isFilled: true, allocatedAt: '2026-01-01T08:00:00Z' }
];

const NOTES: ChairNote[] = [
	{
		id: 'note-2',
		seatId: 'seat-de',
		authorId: 'user-1',
		authorName: 'Ada',
		authorTitle: 'Chair',
		body: 'Strong opening speech.',
		bodyHtml: '<p>Strong opening speech.</p>\n',
		createdAt: '2026-01-01T10:00:00Z'
	},
	{
		id: 'note-1',
		seatId: 'seat-de',
		authorId: 'user-2',
		authorName: 'Sara',
		authorTitle: 'Vice Chair',
		body: 'Late to roll call.',
		bodyHtml: '<p>Late to roll call.</p>\n',
		createdAt: '2026-01-01T09:00:00Z'
	}
];

/** The frame the actions read: only the seats matter here. */
const FRAME = { seats: [SEAT_FR, SEAT_DE] } as ChairRoomFrame;

/** A post to one of the page's actions, from an address that may name a seat. */
function makeActionEvent(
	actionName: string,
	fields: Record<string, string>,
	seatId: string | null = null
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	const seatQuery = seatId === null ? '?' : `?seat=${seatId}&`;

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${NOTES_PATH}${seatQuery}/${actionName}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** The page `load`'s event. `parent()` answers what the chair layout returned. */
/** A chair who may open every page of the console, which the layout hands down. */
const EVERY_TOOL = { mayReviewPapers: true, mayWriteNotes: true, mayProposeAwards: true };

function makeLoadEvent(search = ''): PageServerLoadEvent {
	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${NOTES_PATH}${search}`),
		locals: { supabase: SUPABASE },
		parent: async () => ({
			conference: CONFERENCE,
			committee: COMMITTEE,
			seats: FRAME.seats,
			committeeTools: EVERY_TOOL
		})
	} as unknown as PageServerLoadEvent;
}

/** Run something expected to redirect, and give back the redirect SvelteKit threw. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `fail(400, ...)` gives back: a value the action returns, not throws. */
type FailResult = {
	status: number;
	data: { flash: { message: string }; body: string | null; problem: string | null };
};

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'ada@example.com' },
		conference: CONFERENCE,
		committee: COMMITTEE
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(FRAME);
	vi.mocked(listChairNotes).mockResolvedValue(NOTES);
	vi.mocked(listSeatAllocations).mockResolvedValue(ALLOCATIONS);
	vi.mocked(askHasPermission).mockResolvedValue(false);
	vi.mocked(deleteChairNote).mockResolvedValue(true);
});

describe('load', () => {
	it('opens on the first seat with a delegate, with the note counts', async () => {
		const result = await load(makeLoadEvent());

		expect(listChairNotes).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(askHasPermission).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'administrator');
		expect(result).toMatchObject({
			selectedSeatId: 'seat-de',
			noteCounts: { 'seat-de': 2 },
			canManage: false,
			hasJustAdded: false
		});
	});

	it('opens the seat the address names, even an empty one', async () => {
		const result = await load(makeLoadEvent('?seat=seat-fr&added=1'));

		expect(result).toMatchObject({ selectedSeatId: 'seat-fr', hasJustAdded: true });
	});

	it('ignores a seat that is not one of the committee', async () => {
		const result = await load(makeLoadEvent('?seat=seat-elsewhere'));

		expect(result).toMatchObject({ selectedSeatId: 'seat-de' });
	});
});

describe('the chair gate', () => {
	it('lets the 404 of requireCommitteePermission propagate and writes nothing', async () => {
		vi.mocked(requireCommitteePermission).mockImplementation(() => {
			error(404, 'This committee does not exist.');
		});

		const event = makeActionEvent('add', { seatId: 'seat-de', body: 'Hi' });

		await expect(actions.add(event)).rejects.toMatchObject({ status: 404 });
		expect(addChairNote).not.toHaveBeenCalled();
	});
});

describe('add', () => {
	it('saves the trimmed note in the reader name and keeps the seat', async () => {
		const event = makeActionEvent('add', { seatId: 'seat-de', body: '  Good point.  ' }, 'seat-de');
		const redirected = await catchRedirect(() => actions.add(event));

		expect(addChairNote).toHaveBeenCalledWith(
			SUPABASE,
			{
				committeeId: COMMITTEE.id,
				seatId: 'seat-de',
				authorId: 'user-1',
				body: 'Good point.'
			},
			// No id was sent, so the database chooses one.
			null
		);
		expect(redirected).toMatchObject({
			status: 303,
			location: chairNoteAddedUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'seat-de')
		});
	});

	it('passes on the id the browser chose for the note it is already showing', async () => {
		const newNoteId = '11111111-1111-1111-1111-111111111111';
		const event = makeActionEvent(
			'add',
			{ seatId: 'seat-de', body: 'Good point.', [NEW_ROW_ID_FIELD]: newNoteId },
			'seat-de'
		);

		await catchRedirect(() => actions.add(event));

		expect(addChairNote).toHaveBeenCalledWith(
			SUPABASE,
			expect.objectContaining({ seatId: 'seat-de' }),
			newNoteId
		);
	});

	it('refuses an empty note and hands back what was typed', async () => {
		const event = makeActionEvent('add', { seatId: 'seat-de', body: '   ' }, 'seat-de');
		const result = (await actions.add(event)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data).toMatchObject({
			flash: { message: NOTE_REFUSALS.emptyBody },
			body: '   ',
			problem: NOTE_REFUSALS.emptyBody
		});
		expect(addChairNote).not.toHaveBeenCalled();
	});

	it('refuses a note that is too long', async () => {
		const event = makeActionEvent('add', { seatId: 'seat-de', body: 'x'.repeat(1001) });
		const result = (await actions.add(event)) as FailResult;

		expect(result.data.problem).toBe(NOTE_REFUSALS.longBody);
		expect(addChairNote).not.toHaveBeenCalled();
	});

	it('refuses a seat of another committee', async () => {
		const event = makeActionEvent('add', { seatId: 'seat-elsewhere', body: 'Hi' });
		const result = (await actions.add(event)) as FailResult;

		expect(result.data.flash.message).toBe(NOTE_REFUSALS.seat);
		expect(addChairNote).not.toHaveBeenCalled();
	});
});

describe('delete', () => {
	it('deletes a confirmed note and comes back to the same seat', async () => {
		const event = makeActionEvent('delete', { noteId: 'note-2', confirm: '1' }, 'seat-de');
		const redirected = await catchRedirect(() => actions.delete(event));

		expect(deleteChairNote).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'note-2');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Note deleted.' });
		expect(redirected).toMatchObject({
			status: 303,
			location: chairNotesUrl(CONFERENCE_SLUG, COMMITTEE_SLUG, 'seat-de')
		});
	});

	it('refuses without the confirmation ConfirmButton sends', async () => {
		const event = makeActionEvent('delete', { noteId: 'note-2' }, 'seat-de');
		const result = (await actions.delete(event)) as FailResult;

		expect(result.data.flash.message).toBe(NOTE_REFUSALS.confirm);
		expect(deleteChairNote).not.toHaveBeenCalled();
	});

	it('says so when the delete policy refused, as for another chair note', async () => {
		vi.mocked(deleteChairNote).mockResolvedValue(false);

		const event = makeActionEvent('delete', { noteId: 'note-1', confirm: '1' }, 'seat-de');
		const result = (await actions.delete(event)) as FailResult;

		expect(result.data.flash.message).toBe(NOTE_REFUSALS.note);
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('the page’s own permission', () => {
	it('asks the console’s tools before reading anything', async () => {
		// Its type lets `load` answer without a promise, so `Promise.resolve` gives
		// `.catch` one. What the rest of `load` does past the mocks is not the point here.
		await Promise.resolve(load(makeLoadEvent())).catch(() => undefined);

		expect(requireCommitteeTool).toHaveBeenCalledWith(EVERY_TOOL, 'mayWriteNotes');
	});
});
