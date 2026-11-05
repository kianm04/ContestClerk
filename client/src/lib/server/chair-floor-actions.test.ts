import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChairCommittee, ChairRoomFrame } from '$lib/chair-room';
import {
	floorActions,
	openChairRoom,
	refuseChairAction,
	returnTo,
	type ChairRequestEvent
} from './chair-floor-actions';

// The gate, the room and the floor's moves are stood in for. What each action
// decides is tested in depth through the Room page, in
// `routes/.../chair/page.server.test.ts`; these tests are about what the
// shared pieces promise both pages: which room they open, the shape of a
// refusal, and that every action returns to the address the page asked for.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	getActiveSpeakersList: vi.fn(),
	getChairRoomFrame: vi.fn(),
	timerColumns: vi.fn(),
	updateCommitteeState: vi.fn()
}));

vi.mock('$lib/server/speakers-lists', () => ({
	moveToNextSpeaker: vi.fn(),
	yieldToChair: vi.fn(),
	yieldToSeat: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireCommitteePermission } from '$lib/server/access';
import {
	getActiveSpeakersList,
	getChairRoomFrame,
	timerColumns,
	updateCommitteeState
} from '$lib/server/committee-room';
import { setFlash } from '$lib/server/flash';
import { moveToNextSpeaker, yieldToChair } from '$lib/server/speakers-lists';

const SUPABASE = {};
const COOKIES = {};

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: 'unsc',
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: null,
	defaultSpeakingTimeSeconds: 60,
	topics: ['Climate finance']
};

/** A room with a running session and nobody on the floor. */
const FRAME: ChairRoomFrame = {
	committeeState: {
		currentSessionId: 'session-1',
		mode: 'formal_debate',
		currentMotionId: null,
		activeSpeakersListId: 'list-1',
		currentSpeakerEntryId: null,
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
	},
	sessions: [],
	currentSession: {
		id: 'session-1',
		name: 'Session 1',
		status: 'in_progress',
		startedAt: '2026-01-01T09:00:00.000Z',
		endedAt: null
	},
	currentMotion: null,
	seats: [],
	attendance: {},
	latestRollCallId: null
};

/** A post to a chair page, carrying `fields` as its form. */
function makeEvent(fields: Record<string, string> = {}): ChairRequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: 'thimun-2027', committeeSlug: 'unsc' },
		url: new URL('http://localhost/conferences/thimun-2027/committees/unsc/chair/speakers'),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as ChairRequestEvent;
}

/** Run something expected to redirect, and give back where it was going. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: {} as Awaited<ReturnType<typeof requireCommitteePermission>>['conference'],
		committee: COMMITTEE
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(FRAME);
	vi.mocked(updateCommitteeState).mockResolvedValue(undefined);
});

describe('openChairRoom', () => {
	it('asks the chair gate about the slugs in the address, then reads that committee’s room', async () => {
		const event = makeEvent();

		expect(await openChairRoom(event)).toEqual({
			conference: {},
			committee: COMMITTEE,
			frame: FRAME
		});
		expect(requireCommitteePermission).toHaveBeenCalledWith(
			event.locals,
			event.url,
			'thimun-2027',
			'unsc',
			'run_room'
		);
		expect(getChairRoomFrame).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
	});

	it('lets the gate’s 404 through for a reader who does not chair the committee', async () => {
		// `error` throws, so the stand-in throws the 404 the moment it is called.
		vi.mocked(requireCommitteePermission).mockImplementation(() => {
			error(404, 'This committee does not exist.');
		});

		await expect(openChairRoom(makeEvent())).rejects.toMatchObject({ status: 404 });
		expect(getChairRoomFrame).not.toHaveBeenCalled();
	});
});

describe('refuseChairAction', () => {
	it('answers 400 with the sentence as an error toast', () => {
		const result = refuseChairAction('No.');

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ flash: { tone: 'error', message: 'No.' } });
	});
});

describe('returnTo', () => {
	it('redirects with a 303, leaving a message only when there is one', async () => {
		const plain = await catchRedirect(() => returnTo(makeEvent(), '/somewhere'));

		expect(plain).toMatchObject({ status: 303, location: '/somewhere' });
		expect(setFlash).not.toHaveBeenCalled();

		const flash = { tone: 'info', message: 'Done.' } as const;
		await catchRedirect(() => returnTo(makeEvent(), '/somewhere', flash));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, flash);
	});
});

describe('floorActions', () => {
	it('sends the chair to the address the page works out from the event and the room', async () => {
		const returnAddress = vi.fn(() => '/the-page?list=list-1');
		const actions = floorActions(returnAddress);
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: { id: 'list-1', name: 'GSL', speakingTimeSeconds: 60, isOpen: true },
			speakers: []
		});
		const event = makeEvent({ seconds: '60' });

		const redirect = await catchRedirect(() => actions.timerStart(event));

		expect(redirect).toMatchObject({ status: 303, location: '/the-page?list=list-1' });
		expect(returnAddress).toHaveBeenCalledWith(event, FRAME);
	});

	it('starts the timer from the moment the chair’s browser says it was pressed (T139)', async () => {
		const pressedAt = new Date(Date.now() - 800).toISOString();
		const event = makeEvent({ seconds: '60', pressedAt });

		await catchRedirect(() => floorActions(() => '/').timerStart(event));

		const endsAt = new Date(new Date(pressedAt).getTime() + 60_000).toISOString();
		expect(timerColumns).toHaveBeenCalledWith({
			totalSeconds: 60,
			endsAt,
			pausedRemainingSeconds: null
		});
	});

	it('starts the timer from the server’s own time when the press says nothing', async () => {
		const before = Date.now();

		await catchRedirect(() => floorActions(() => '/').timerStart(makeEvent({ seconds: '60' })));

		const written = vi.mocked(timerColumns).mock.calls[0][0];
		const endsAt = new Date(written.endsAt ?? '').getTime();
		expect(endsAt).toBeGreaterThanOrEqual(before + 60_000);
		expect(endsAt).toBeLessThanOrEqual(Date.now() + 60_000);
	});

	it('gives the next speaker the floor from the moment the chair pressed', async () => {
		const pressedAt = new Date(Date.now() - 800).toISOString();
		const list = {
			speakersList: { id: 'list-1', name: 'GSL', speakingTimeSeconds: 60, isOpen: true },
			speakers: []
		};
		vi.mocked(getActiveSpeakersList).mockResolvedValue(list);
		vi.mocked(moveToNextSpeaker).mockResolvedValue('moved');

		await catchRedirect(() => floorActions(() => '/').nextSpeaker(makeEvent({ pressedAt })));

		expect(moveToNextSpeaker).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			FRAME.committeeState,
			list,
			new Date(pressedAt)
		);
	});

	it('says the list is empty when nobody present was waiting', async () => {
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: { id: 'list-1', name: 'GSL', speakingTimeSeconds: 60, isOpen: true },
			speakers: []
		});
		vi.mocked(moveToNextSpeaker).mockResolvedValue('empty');

		await catchRedirect(() => floorActions(() => '/').nextSpeaker(makeEvent()));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'info', message: 'The list is empty.' });
	});

	it('refuses "Next" with no list, and while the room calls nobody from its list', async () => {
		vi.mocked(getActiveSpeakersList).mockResolvedValue({ speakersList: null, speakers: [] });
		const noList = await floorActions(() => '/').nextSpeaker(makeEvent());

		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: { id: 'list-1', name: 'GSL', speakingTimeSeconds: 60, isOpen: true },
			speakers: []
		});

		for (const mode of ['unmoderated_caucus', 'voting', 'suspended'] as const) {
			vi.mocked(getChairRoomFrame).mockResolvedValue({
				...FRAME,
				committeeState: { ...FRAME.committeeState, mode }
			});
			const refused = await floorActions(() => '/').nextSpeaker(makeEvent());

			expect(refused).toMatchObject({
				status: 400,
				data: { flash: { tone: 'error', message: 'There is no speakers list open.' } }
			});
		}

		expect(noList).toMatchObject({ status: 400 });
		expect(moveToNextSpeaker).not.toHaveBeenCalled();
	});

	it('offers the same nine actions to every page', () => {
		expect(Object.keys(floorActions(() => '/')).sort()).toEqual([
			'endSpeech',
			'nextSpeaker',
			'timerAdd',
			'timerPause',
			'timerReset',
			'timerResume',
			'timerStart',
			'yieldToChair',
			'yieldToSeat'
		]);
	});
});

describe('floorActions in a moderated caucus (S7)', () => {
	// A moment just gone, as a chair's browser sends it (`pressedMoment` takes no other).
	const PRESSED = new Date(Date.now() - 500);
	const PRESSED_AT = PRESSED.toISOString();
	const TIMER_WRITE = {
		timer_total_seconds: 60,
		timer_ends_at: null,
		timer_paused_remaining_seconds: 60
	};

	/** A moderated caucus with Kenya's clock ready and the caucus clock paused at 6:12. */
	const MOD_FRAME: ChairRoomFrame = {
		...FRAME,
		committeeState: {
			...FRAME.committeeState,
			mode: 'moderated_caucus',
			currentMotionId: 'motion-1',
			activeSpeakersListId: 'caucus-1',
			currentSpeakerEntryId: 'entry-ke',
			timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 },
			caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 }
		}
	};

	beforeEach(() => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(MOD_FRAME);
		vi.mocked(timerColumns).mockReturnValue(TIMER_WRITE);
	});

	it('starts the caucus clock with the speaker’s, in the same update', async () => {
		await catchRedirect(() =>
			floorActions(() => '/').timerResume(makeEvent({ pressedAt: PRESSED_AT }))
		);

		expect(updateCommitteeState).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, {
			...TIMER_WRITE,
			caucus_total_seconds: 600,
			caucus_ends_at: new Date(PRESSED.getTime() + 372_000).toISOString(),
			caucus_paused_remaining_seconds: null
		});
	});

	it('leaves the caucus clock alone with +15 s', async () => {
		await catchRedirect(() =>
			floorActions(() => '/').timerAdd(makeEvent({ pressedAt: PRESSED_AT }))
		);

		expect(updateCommitteeState).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, {
			...TIMER_WRITE,
			caucus_total_seconds: 600,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: 372
		});
	});

	it('pauses the caucus clock when the speech ends', async () => {
		const running = {
			...MOD_FRAME,
			committeeState: {
				...MOD_FRAME.committeeState,
				caucusClock: {
					totalSeconds: 600,
					endsAt: '2099-01-01T00:00:00.000Z',
					pausedRemainingSeconds: null
				}
			}
		};
		vi.mocked(getChairRoomFrame).mockResolvedValue(running);
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: { id: 'caucus-1', name: 'Corridors', speakingTimeSeconds: 60, isOpen: true },
			speakers: []
		});

		await catchRedirect(() => floorActions(() => '/').endSpeech(makeEvent()));

		const alsoWrites = vi.mocked(yieldToChair).mock.calls[0][5];
		expect(alsoWrites?.caucus_ends_at).toBeNull();
		expect(alsoWrites?.caucus_paused_remaining_seconds).toBeGreaterThan(0);
	});
});
