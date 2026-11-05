import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import { CHAIR_AWARD_REFUSALS } from '$lib/award-form';
import type { Award, AwardSeat } from '$lib/awards';
import type { ChairCommittee } from '$lib/chair-room';
import type { ChairNote } from '$lib/chair-notes';
import type { Conference } from '$lib/conferences';
import { chairAwardsUrl } from '$lib/urls';

// The gate and the award and note queries are stood in for, so these tests are
// about what the page decides: which refusal each rule answers with, what it
// writes, and where it sends the chair back. The queries have their own tests
// in `src/lib/server/awards.test.ts` and `award-changes.test.ts`, what the
// database allows is in `tests/db/awards.test.ts`, and the whole page runs
// against a real database in `tests/e2e/awards.spec.ts`.
vi.mock('$lib/server/access', () => ({
	askHasPermission: vi.fn(),
	requireCommitteePermission: vi.fn(),
	requireCommitteeTool: vi.fn()
}));

vi.mock('$lib/server/awards', () => ({
	listAwardSeats: vi.fn(),
	listCommitteeAwards: vi.fn(),
	readAwardsPublishedAt: vi.fn()
}));

vi.mock('$lib/server/award-changes', () => ({
	deleteAward: vi.fn(),
	proposeAward: vi.fn(),
	updateAwardProposal: vi.fn()
}));

vi.mock('$lib/server/chair-notes', () => ({ listChairNotes: vi.fn() }));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import {
	askHasPermission,
	requireCommitteePermission,
	requireCommitteeTool
} from '$lib/server/access';
import { deleteAward, proposeAward, updateAwardProposal } from '$lib/server/award-changes';
import { listAwardSeats, listCommitteeAwards, readAwardsPublishedAt } from '$lib/server/awards';
import { listChairNotes } from '$lib/server/chair-notes';
import { setFlash } from '$lib/server/flash';
import { NEW_ROW_ID_FIELD } from '$lib/new-row-id';

/** The Supabase client. The page only hands it on to the server modules above. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'unsc';
const AWARDS_PATH = `/conferences/${CONFERENCE_SLUG}/committees/${COMMITTEE_SLUG}/chair/awards`;

const COMMITTEE = {
	id: 'committee-1',
	slug: COMMITTEE_SLUG,
	name: 'Security Council'
} as ChairCommittee;

/** Only the fields `load` and the actions read. */
const CONFERENCE = { id: 'conference-1', slug: CONFERENCE_SLUG } as Conference;

const SEAT_FR: AwardSeat = {
	id: 'seat-fr',
	name: 'France',
	countryCode: 'FR',
	isFilled: true,
	delegateName: 'Amira Haddad'
};
const SEAT_DE: AwardSeat = {
	id: 'seat-de',
	name: 'Germany',
	countryCode: 'DE',
	isFilled: false,
	delegateName: null
};

/** A proposal the reader, `chair-1`, made. */
const OWN_PROPOSAL: Award = {
	id: 'award-1',
	committeeId: COMMITTEE.id,
	seatId: SEAT_FR.id,
	seatName: 'France',
	countryCode: 'FR',
	holderName: 'Amira Haddad',
	isSeatEmpty: false,
	kind: 'best_delegate',
	title: 'Best Delegate',
	status: 'proposed',
	createdBy: 'chair-1',
	proposerName: 'Ada'
};

/** A proposal the other chair made. */
const OTHER_PROPOSAL: Award = {
	...OWN_PROPOSAL,
	id: 'award-2',
	kind: 'custom',
	title: 'Best Speech',
	createdBy: 'chair-2'
};

/** Two notes about France, which the page counts per seat. */
const NOTES = [
	{ id: 'note-1', seatId: SEAT_FR.id },
	{ id: 'note-2', seatId: SEAT_FR.id }
] as ChairNote[];

/** A post to one of the page's actions. */
function makeActionEvent(
	actionName: string,
	fields: Record<string, string>,
	search = '?'
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${AWARDS_PATH}${search}/${actionName}`),
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
		url: new URL(`http://localhost${AWARDS_PATH}${search}`),
		locals: { supabase: SUPABASE },
		parent: async () => ({
			conference: CONFERENCE,
			committee: COMMITTEE,
			readerId: 'chair-1',
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
	data: {
		flash: { message: string };
		values: { seatId: string; kind: string; title: string } | null;
		errors: Record<string, string>;
	};
};

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'chair-1', email: 'ada@example.com' },
		conference: CONFERENCE,
		committee: COMMITTEE
	});
	vi.mocked(listCommitteeAwards).mockResolvedValue([OWN_PROPOSAL, OTHER_PROPOSAL]);
	vi.mocked(listAwardSeats).mockResolvedValue([
		{ ...SEAT_FR, committeeId: COMMITTEE.id },
		{ ...SEAT_DE, committeeId: COMMITTEE.id }
	]);
	vi.mocked(listChairNotes).mockResolvedValue(NOTES);
	vi.mocked(readAwardsPublishedAt).mockResolvedValue(null);
	vi.mocked(askHasPermission).mockResolvedValue(false);
	vi.mocked(proposeAward).mockResolvedValue({ result: 'saved', awardId: 'award-3' });
	vi.mocked(updateAwardProposal).mockResolvedValue('saved');
	vi.mocked(deleteAward).mockResolvedValue(true);
});

describe('load', () => {
	it('hands back the awards, the filled seats only and the note count per seat', async () => {
		const result = await load(makeLoadEvent());

		expect(listCommitteeAwards).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(listChairNotes).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(result).toMatchObject({
			awards: [OWN_PROPOSAL, OTHER_PROPOSAL],
			noteCounts: { 'seat-fr': 2 },
			awardsPublishedAt: null,
			canManage: false,
			awardBeingEdited: null
		});
		expect(result?.filledSeats.map((seat: AwardSeat) => seat.id)).toEqual(['seat-fr']);
	});

	it('opens the reader’s own proposal for editing when the address names it', async () => {
		const result = await load(makeLoadEvent('?edit=award-1'));

		expect(result?.awardBeingEdited).toEqual(OWN_PROPOSAL);
	});

	it('does not open another chair’s proposal for editing', async () => {
		const result = await load(makeLoadEvent('?edit=award-2'));

		expect(result?.awardBeingEdited).toBeNull();
	});

	it('opens nothing for editing once the awards are published', async () => {
		vi.mocked(readAwardsPublishedAt).mockResolvedValue('2027-02-15T16:00:00Z');

		const result = await load(makeLoadEvent('?edit=award-1'));

		expect(result?.awardBeingEdited).toBeNull();
	});
});

describe('the chair gate', () => {
	it('lets the 404 of requireCommitteePermission propagate and writes nothing', async () => {
		vi.mocked(requireCommitteePermission).mockImplementation(() => {
			error(404, 'This committee does not exist.');
		});

		const event = makeActionEvent('propose', { seatId: 'seat-fr', kind: 'best_delegate' });

		await expect(actions.propose(event)).rejects.toMatchObject({ status: 404 });
		expect(proposeAward).not.toHaveBeenCalled();
	});
});

describe('propose', () => {
	it('proposes an award titled with its kind, and says so', async () => {
		const event = makeActionEvent('propose', {
			seatId: 'seat-fr',
			kind: 'best_delegate',
			title: 'ignored'
		});

		const thrown = await catchRedirect(() => actions.propose(event));

		expect(proposeAward).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			{
				seatId: 'seat-fr',
				seatName: 'France',
				kind: 'best_delegate',
				title: 'Best Delegate'
			},
			// No id was sent, so the database chooses one.
			null
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Award proposed.'
		});
		expect(thrown).toMatchObject({
			status: 303,
			location: chairAwardsUrl(CONFERENCE_SLUG, COMMITTEE_SLUG)
		});
	});

	it('passes on the id the browser chose for the award it is already showing', async () => {
		const newAwardId = '11111111-1111-1111-1111-111111111111';
		const event = makeActionEvent('propose', {
			seatId: 'seat-fr',
			kind: 'best_delegate',
			[NEW_ROW_ID_FIELD]: newAwardId
		});

		await catchRedirect(() => actions.propose(event));

		expect(proposeAward).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			expect.objectContaining({ seatId: 'seat-fr' }),
			newAwardId
		);
	});

	it('keeps a custom title as typed, trimmed', async () => {
		const event = makeActionEvent('propose', {
			seatId: 'seat-fr',
			kind: 'custom',
			title: '  Best Speech  '
		});

		await catchRedirect(() => actions.propose(event));

		expect(proposeAward).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			expect.objectContaining({ kind: 'custom', title: 'Best Speech' }),
			null
		);
	});

	it('refuses a custom award without a title and keeps what was chosen', async () => {
		const event = makeActionEvent('propose', { seatId: 'seat-fr', kind: 'custom', title: ' ' });

		const result = (await actions.propose(event)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash.message).toBe('Give the custom award a title.');
		expect(result.data.errors).toEqual({ title: 'Give the custom award a title.' });
		expect(result.data.values).toEqual({ seatId: 'seat-fr', kind: 'custom', title: ' ' });
		expect(proposeAward).not.toHaveBeenCalled();
	});

	it('refuses a seat without a delegate', async () => {
		const event = makeActionEvent('propose', { seatId: 'seat-de', kind: 'best_delegate' });

		const result = (await actions.propose(event)) as FailResult;

		expect(result.data.errors).toEqual({ seatId: 'That seat has no delegate.' });
		expect(proposeAward).not.toHaveBeenCalled();
	});

	it('words a second award of the same kind for one seat', async () => {
		vi.mocked(proposeAward).mockResolvedValue({ result: 'duplicate', awardId: null });
		const event = makeActionEvent('propose', { seatId: 'seat-fr', kind: 'best_delegate' });

		const result = (await actions.propose(event)) as FailResult;

		expect(result.data.flash.message).toBe('France already has this award.');
		expect(result.data.errors).toEqual({ seatId: 'France already has this award.' });
	});

	it('refuses everything once the awards are published', async () => {
		vi.mocked(readAwardsPublishedAt).mockResolvedValue('2027-02-15T16:00:00Z');
		const event = makeActionEvent('propose', { seatId: 'seat-fr', kind: 'best_delegate' });

		const result = (await actions.propose(event)) as FailResult;

		expect(result.data.flash.message).toBe(CHAIR_AWARD_REFUSALS.published);
		expect(proposeAward).not.toHaveBeenCalled();
	});
});

describe('update', () => {
	it('rewords the reader’s own proposal', async () => {
		const event = makeActionEvent(
			'update',
			{ awardId: 'award-1', seatId: 'seat-fr', kind: 'outstanding_delegate' },
			'?edit=award-1&'
		);

		const thrown = await catchRedirect(() => actions.update(event));

		expect(updateAwardProposal).toHaveBeenCalledWith(SUPABASE, 'award-1', {
			seatId: 'seat-fr',
			seatName: 'France',
			kind: 'outstanding_delegate',
			title: 'Outstanding Delegate'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Proposal saved.'
		});
		expect(thrown.location).toBe(chairAwardsUrl(CONFERENCE_SLUG, COMMITTEE_SLUG));
	});

	it('refuses another chair’s proposal', async () => {
		const event = makeActionEvent('update', {
			awardId: 'award-2',
			seatId: 'seat-fr',
			kind: 'custom',
			title: 'New'
		});

		const result = (await actions.update(event)) as FailResult;

		expect(result.data.flash.message).toBe(CHAIR_AWARD_REFUSALS.notYours);
		expect(updateAwardProposal).not.toHaveBeenCalled();
	});

	it('refuses a confirmed award', async () => {
		vi.mocked(listCommitteeAwards).mockResolvedValue([{ ...OWN_PROPOSAL, status: 'confirmed' }]);
		const event = makeActionEvent('update', {
			awardId: 'award-1',
			seatId: 'seat-fr',
			kind: 'best_delegate'
		});

		const result = (await actions.update(event)) as FailResult;

		expect(result.data.flash.message).toBe(CHAIR_AWARD_REFUSALS.notYours);
		expect(updateAwardProposal).not.toHaveBeenCalled();
	});

	it('words a rewording that collides with another award', async () => {
		vi.mocked(updateAwardProposal).mockResolvedValue('duplicate');
		const event = makeActionEvent('update', {
			awardId: 'award-1',
			seatId: 'seat-fr',
			kind: 'custom',
			title: 'Best Speech'
		});

		const result = (await actions.update(event)) as FailResult;

		expect(result.data.flash.message).toBe('France already has this award.');
	});
});

describe('withdraw', () => {
	it('withdraws the reader’s own proposal', async () => {
		const event = makeActionEvent('withdraw', { awardId: 'award-1', confirm: '1' });

		await catchRedirect(() => actions.withdraw(event));

		expect(deleteAward).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'award-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Proposal withdrawn.'
		});
	});

	it('refuses another chair’s proposal to a chair', async () => {
		const event = makeActionEvent('withdraw', { awardId: 'award-2', confirm: '1' });

		const result = (await actions.withdraw(event)) as FailResult;

		expect(result.data.flash.message).toBe(CHAIR_AWARD_REFUSALS.notYours);
		expect(deleteAward).not.toHaveBeenCalled();
	});

	it('lets an organiser withdraw another chair’s proposal', async () => {
		vi.mocked(askHasPermission).mockResolvedValue(true);
		const event = makeActionEvent('withdraw', { awardId: 'award-2', confirm: '1' });

		await catchRedirect(() => actions.withdraw(event));

		expect(deleteAward).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'award-2');
	});

	it('refuses a post that was not confirmed', async () => {
		const event = makeActionEvent('withdraw', { awardId: 'award-1' });

		const result = (await actions.withdraw(event)) as FailResult;

		expect(result.data.flash.message).toBe(CHAIR_AWARD_REFUSALS.confirm);
		expect(deleteAward).not.toHaveBeenCalled();
	});

	it('refuses once the awards are published', async () => {
		vi.mocked(readAwardsPublishedAt).mockResolvedValue('2027-02-15T16:00:00Z');
		const event = makeActionEvent('withdraw', { awardId: 'award-1', confirm: '1' });

		const result = (await actions.withdraw(event)) as FailResult;

		expect(result.data.flash.message).toBe(CHAIR_AWARD_REFUSALS.published);
		expect(deleteAward).not.toHaveBeenCalled();
	});
});

describe('the page’s own permission', () => {
	it('asks the console’s tools before reading anything', async () => {
		// Its type lets `load` answer without a promise, so `Promise.resolve` gives
		// `.catch` one. What the rest of `load` does past the mocks is not the point here.
		await Promise.resolve(load(makeLoadEvent())).catch(() => undefined);

		expect(requireCommitteeTool).toHaveBeenCalledWith(EVERY_TOOL, 'mayProposeAwards');
	});
});
