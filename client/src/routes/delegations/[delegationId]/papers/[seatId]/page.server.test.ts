import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and `saveDraft` are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { DelegationPaper, PaperSharing } from '$lib/delegation-papers';
import type { LivePaperSetup } from '$lib/paper-live.svelte';
import type { PaperDraft } from '$lib/paper-writing';
import { delegationPaperUrl, positionPaperWayUrl } from '$lib/urls';

// The gates and the queries are stood in for, so these tests are about what
// `load` and `saveDraft` decide. What the database allows is tested in
// `tests/db/delegation-paper-drafts.test.ts`. `$lib/server/paper-draft-form`
// is the real one, so the answers here are the ones the owner's page gives.
vi.mock('$lib/server/access', () => ({
	requireDelegationMember: vi.fn(),
	requireOnboarded: vi.fn()
}));

vi.mock('$lib/server/conferences', () => ({ getConferenceBySlug: vi.fn() }));

vi.mock('$lib/server/delegation-papers', () => ({
	findDelegationPaper: vi.fn(),
	readCommitteeTopics: vi.fn(),
	readDelegationSharing: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

vi.mock('$lib/server/position-paper-drafts', () => ({
	readPaperDraft: vi.fn(),
	savePaperDraft: vi.fn()
}));

// Only the live setup is stood in for; the live save keeps the real module's shape.
vi.mock('$lib/server/paper-live-drafts', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/paper-live-drafts')>()),
	readLivePaperSetup: vi.fn(),
	// No live document is stored, so a plain "Save draft" has no suggestions to lose.
	readLiveDocumentState: vi.fn(async () => null)
}));

// The margin's threads have their own tests in `$lib/server/paper-comments.test.ts`.
vi.mock('$lib/server/paper-comments', () => ({
	readPaperThreads: vi.fn(async () => []),
	markThreadNotificationsRead: vi.fn()
}));

import { requireDelegationMember, requireOnboarded } from '$lib/server/access';
import { getConferenceBySlug } from '$lib/server/conferences';
import {
	findDelegationPaper,
	readCommitteeTopics,
	readDelegationSharing
} from '$lib/server/delegation-papers';
import { setFlash } from '$lib/server/flash';
import { readPaperThreads } from '$lib/server/paper-comments';
import { readLivePaperSetup } from '$lib/server/paper-live-drafts';
import { readPaperDraft, savePaperDraft } from '$lib/server/position-paper-drafts';

const SUPABASE = {};
const COOKIES = {};
const DELEGATION_ID = 'delegation-1';
const SEAT_ID = 'seat-france';

/** The member reading the page: Tom, who is not in the seat. */
const READER = { id: 'member-tom', email: 'tom@example.com' };

const DELEGATION = { id: DELEGATION_ID, name: "St Aidan's Academy" };
const CONFERENCE = { id: 'conference-1', slug: 'delft-mun-2099', timezone: 'Europe/Amsterdam' };

/** Rachel's paper for France, which Tom may edit but not submit. */
function rachelsPaper(overrides: Partial<DelegationPaper> = {}): DelegationPaper {
	return {
		seatId: SEAT_ID,
		seatName: 'France',
		countryCode: 'FR',
		committeeName: 'Security Council',
		committeeSlug: 'unsc',
		holderId: 'member-rachel',
		holderName: 'Rachel Morgan',
		paperKind: null,
		reviewStatus: null,
		reviewComment: null,
		lastEditedById: null,
		lastEditedByName: null,
		lastEditedAt: null,
		wordCount: 0,
		...overrides
	};
}

const DRAFT: PaperDraft = {
	body: 'France supports',
	revision: 3,
	updatedAt: '2099-01-01T09:00:00.000Z',
	updatedById: 'member-rachel',
	updatedByName: 'Rachel Morgan'
};

const SHARING: PaperSharing = {
	delegationName: DELEGATION.name,
	members: [
		{ id: 'member-rachel', name: 'Rachel Morgan' },
		{ id: 'member-tom', name: 'Tom Price' }
	]
};

/** What the page hands on for writing the paper live (T148), since it is shared. */
const LIVE: LivePaperSetup = {
	topic: `paper:${SEAT_ID}`,
	documentState: null,
	openSuggestions: 0,
	writer: { id: READER.id, name: 'Tom Price' },
	writers: [{ id: READER.id, name: 'Tom Price' }]
};

function makeLoadEvent(): PageServerLoadEvent {
	return {
		params: { delegationId: DELEGATION_ID, seatId: SEAT_ID },
		url: new URL(`http://localhost/delegations/${DELEGATION_ID}/papers/${SEAT_ID}`),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		parent: async () => ({ delegation: DELEGATION, conference: CONFERENCE })
	} as unknown as PageServerLoadEvent;
}

function makeSaveEvent(fields: Record<string, string>): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		params: { delegationId: DELEGATION_ID, seatId: SEAT_ID },
		url: new URL(`http://localhost/delegations/${DELEGATION_ID}/papers/${SEAT_ID}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** Run something expected to throw a `redirect` or an `error`, and give back what it threw. */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown.');
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireOnboarded).mockResolvedValue(READER);
	vi.mocked(requireDelegationMember).mockResolvedValue({
		user: READER,
		delegation: DELEGATION,
		conference: CONFERENCE,
		myRole: 'member'
	} as unknown as Awaited<ReturnType<typeof requireDelegationMember>>);
	vi.mocked(findDelegationPaper).mockResolvedValue(rachelsPaper());
	vi.mocked(readPaperDraft).mockResolvedValue(DRAFT);
	vi.mocked(readCommitteeTopics).mockResolvedValue(['Nuclear energy']);
	vi.mocked(readDelegationSharing).mockResolvedValue(SHARING);
	vi.mocked(readLivePaperSetup).mockResolvedValue(LIVE);
	vi.mocked(getConferenceBySlug).mockResolvedValue({
		name: 'Delft MUN 2099',
		positionPaperDeadline: '2099-02-01T12:00:00.000Z',
		timezone: 'Europe/Amsterdam'
	} as unknown as Awaited<ReturnType<typeof getConferenceBySlug>>);
});

describe('the page load', () => {
	it('hands a fellow member the paper, its draft, the notes and who it is shared with', async () => {
		const result = await load(makeLoadEvent());

		expect(findDelegationPaper).toHaveBeenCalledWith(SUPABASE, DELEGATION_ID, SEAT_ID);
		expect(readDelegationSharing).toHaveBeenCalledWith(SUPABASE, DELEGATION);
		expect(readLivePaperSetup).toHaveBeenCalledWith(SUPABASE, SEAT_ID, SHARING, READER.id);
		expect(result).toEqual({
			paper: rachelsPaper(),
			draft: DRAFT,
			deadline: { positionPaperDeadline: '2099-02-01T12:00:00.000Z', timezone: 'Europe/Amsterdam' },
			topics: ['Nuclear energy'],
			sharing: SHARING,
			readerId: READER.id,
			view: 'editor',
			closedReason: null,
			live: LIVE,
			threads: [],
			timeZone: 'Europe/Amsterdam',
			commentAddress: null,
			// The paper's own heading, from the seat, the committee and the conference.
			sheetHeading: {
				seatName: 'France',
				conferenceName: 'Delft MUN 2099',
				lines: [
					{ label: 'Country', value: 'France' },
					{ label: 'Committee', value: 'Security Council' },
					{ label: 'Topic', value: 'Nuclear energy' }
				]
			}
		});
	});

	it('reads the threads in the margin as the reader, naming no seats', async () => {
		await load(makeLoadEvent());

		expect(readPaperThreads).toHaveBeenCalledWith(
			SUPABASE,
			{ kind: 'position', seatId: SEAT_ID },
			{ id: READER.id, committeeId: null, timeZone: 'Europe/Amsterdam' }
		);
	});

	it('is a 404 for a seat no member of the delegation holds', async () => {
		vi.mocked(findDelegationPaper).mockResolvedValue(null);

		const thrown = await catchThrown(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(404);
		expect(readPaperDraft).not.toHaveBeenCalled();
	});

	it('sends the delegate in the seat to their own page, where they can submit', async () => {
		vi.mocked(requireOnboarded).mockResolvedValue({ id: 'member-rachel', email: 'r@example.com' });

		const thrown = await catchThrown(() => load(makeLoadEvent()));

		expect(thrown).toMatchObject({
			status: 303,
			location: positionPaperWayUrl(CONFERENCE.slug, 'unsc', 'write')
		});
	});

	it('shows a handed-in written paper as handed in until its delegate starts a new draft', async () => {
		vi.mocked(findDelegationPaper).mockResolvedValue(
			rachelsPaper({ paperKind: 'written', reviewStatus: 'submitted' })
		);
		vi.mocked(readPaperDraft).mockResolvedValue(null);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ view: 'submitted' });
	});
});

describe('saveDraft', () => {
	it("saves a fellow member's draft and answers the autosave with the revision", async () => {
		vi.mocked(savePaperDraft).mockResolvedValue({ kind: 'saved', revision: 4 });

		const result = await actions.saveDraft(
			makeSaveEvent({ body: 'France supports, says Tom', revision: '3', background: '1' })
		);

		expect(requireDelegationMember).toHaveBeenCalledWith(
			expect.anything(),
			expect.any(URL),
			DELEGATION_ID
		);
		expect(savePaperDraft).toHaveBeenCalledWith(SUPABASE, {
			seatId: SEAT_ID,
			body: 'France supports, says Tom',
			baseRevision: 3
		});
		expect(result).toEqual({ draftSaved: { revision: 4 } });
	});

	it('comes back to this page without JavaScript', async () => {
		vi.mocked(savePaperDraft).mockResolvedValue({ kind: 'saved', revision: 4 });

		const thrown = await catchThrown(() =>
			actions.saveDraft(makeSaveEvent({ body: 'Text', revision: '3' }))
		);

		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Draft saved.' });
		expect(thrown).toMatchObject({
			status: 303,
			location: delegationPaperUrl(DELEGATION_ID, SEAT_ID)
		});
	});

	it('hands back the draft saved first on a clash', async () => {
		vi.mocked(savePaperDraft).mockResolvedValue({ kind: 'conflict', revision: 5, theirs: DRAFT });

		const result = await actions.saveDraft(
			makeSaveEvent({ body: 'Mine', revision: '3', background: '1' })
		);

		expect(result).toMatchObject({
			status: 409,
			data: { draftText: 'Mine', draftConflict: { revision: 5, theirs: { body: DRAFT.body } } }
		});
	});

	it('refuses a seat no member of the delegation holds any more, saving nothing', async () => {
		vi.mocked(findDelegationPaper).mockResolvedValue(null);

		const thrown = await catchThrown(() =>
			actions.saveDraft(makeSaveEvent({ body: 'Text', revision: '3', background: '1' }))
		);

		expect(thrown.status).toBe(404);
		expect(savePaperDraft).not.toHaveBeenCalled();
	});
});

describe('the comment actions', () => {
	it('send the delegate in the seat to their own page, as a 404 here', async () => {
		vi.mocked(requireDelegationMember).mockResolvedValue({
			user: { id: 'member-rachel', email: 'r@example.com' },
			delegation: DELEGATION,
			conference: CONFERENCE,
			myRole: 'member'
		} as unknown as Awaited<ReturnType<typeof requireDelegationMember>>);

		const thrown = await catchThrown(() => actions.startThread(makeSaveEvent({ body: 'Hi' })));

		expect(thrown.status).toBe(404);
	});
});
