import { error } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import {
	ROOM_REFUSALS,
	type ChairCommittee,
	type ChairRoomFrame,
	type CommitteeSession,
	type RoomSpeaker,
	type SpeakersListSummary
} from '$lib/chair-room';
import type { AttendanceStatus, CommitteeMode, RoomSeat } from '$lib/committee-room';
import type { Conference } from '$lib/conferences';
import { SUSPENSION_REFUSALS } from '$lib/room-suspended';
import { RETURN_TIME_REFUSALS } from '$lib/suspension';
import { chairRoomUrl } from '$lib/urls';

// The gate and every server module that writes to the room are stood in for,
// so these tests are about what the room's actions themselves decide: which
// refusal each rule answers with, what they call once a request passes, and
// where they send the chair back to. `requireCommitteePermission` has its own tests in
// `src/lib/server/access`, and `setRoomMode`, `startSession` and the rest have
// theirs next to the modules that hold them.
//
// `$lib/chair-room` and `$lib/committee-room` are deliberately not stood in
// for: they are pure, and running the real rules is what proves the actions
// and the room agree about which mode may be set, which seat a speaker may
// yield to and how the timer's seconds are worked out.
vi.mock('$lib/server/access', () => ({ requireCommitteePermission: vi.fn() }));

vi.mock('$lib/server/committee-room', () => ({
	addCommitteeTopic: vi.fn(),
	getActiveSpeakersList: vi.fn(),
	getChairRoomFrame: vi.fn(),
	resumeRoom: vi.fn(),
	setAgendaTopic: vi.fn(),
	setRoomMode: vi.fn(),
	setSuspensionReturn: vi.fn(),
	suspendRoom: vi.fn(),
	timerColumns: vi.fn(),
	updateCommitteeState: vi.fn()
}));

// Aliased on import: the room's two session actions are named the same as
// these functions, and giving the functions a different local name here keeps
// `actions.startSession` and the mocked `startSession` from reading as the
// same thing.
vi.mock('$lib/server/committee-sessions', () => ({
	endSession: vi.fn(),
	startSession: vi.fn()
}));

// What the lobby, the ended and the suspended screens read (`room-screens.test.ts` tests them).
vi.mock('$lib/server/room-screens', () => ({
	readIsQuickSession: vi.fn(),
	readLobbyFacts: vi.fn(),
	readSuspendedRoom: vi.fn()
}));

vi.mock('$lib/server/speakers-lists', () => ({
	moveToNextSpeaker: vi.fn(),
	yieldToChair: vi.fn(),
	yieldToSeat: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

// What each live view reads, the readers `chair`'s views share with their own routes.
vi.mock('$lib/server/live-room-views', () => ({ readLiveRoomViews: vi.fn() }));

vi.mock('$lib/server/speakers-list-edits', () => ({
	addSpeaker: vi.fn(),
	getSpeakersLists: vi.fn(),
	removeSpeaker: vi.fn(),
	swapSpeakers: vi.fn()
}));

import { requireCommitteePermission } from '$lib/server/access';
import {
	addCommitteeTopic,
	getActiveSpeakersList,
	getChairRoomFrame,
	resumeRoom,
	setAgendaTopic,
	setRoomMode,
	setSuspensionReturn,
	suspendRoom,
	timerColumns,
	updateCommitteeState
} from '$lib/server/committee-room';
import {
	endSession as endSessionOnServer,
	startSession as startSessionOnServer
} from '$lib/server/committee-sessions';
import { readIsQuickSession, readLobbyFacts, readSuspendedRoom } from '$lib/server/room-screens';
import {
	moveToNextSpeaker,
	yieldToChair as yieldToChairOnServer,
	yieldToSeat as yieldToSeatOnServer
} from '$lib/server/speakers-lists';
import { setFlash } from '$lib/server/flash';
import { caucusActions } from '$lib/server/caucus-actions';
import { readLiveRoomViews } from '$lib/server/live-room-views';
import { singleSpeakerActions } from '$lib/server/single-speaker-actions';
import { queueActions } from '$lib/server/speaker-queue-actions';
import { voteActions } from '$lib/server/vote-view';
import { floorActions } from '$lib/server/chair-floor-actions';
import { addSpeaker, getSpeakersLists, removeSpeaker } from '$lib/server/speakers-list-edits';

/** The Supabase client. Every action only hands it on to the server modules above. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The moment every test runs at, fixed with `vi.useFakeTimers`, so a timer's
 * exact seconds and `endsAt` can be checked rather than merely "some date". */
const NOW = new Date('2026-01-01T10:00:00.000Z');

/** The conference and committee slugs every stand-in event carries. */
const CONFERENCE_SLUG = 'thimun-2027';
const COMMITTEE_SLUG = 'unsc';
const CHAIR_PATH = `/conferences/${CONFERENCE_SLUG}/committees/${COMMITTEE_SLUG}/chair`;

const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: COMMITTEE_SLUG,
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: 'Room 1',
	defaultSpeakingTimeSeconds: 60,
	topics: ['Climate finance', 'Protection of civilians']
};

/**
 * The conference the committee belongs to. `requireCommitteePermission` reads a whole
 * `Conference`; nothing under test here reads more of it than the id.
 */
const CONFERENCE: Conference = {
	id: 'conference-1',
	slug: CONFERENCE_SLUG,
	name: 'THIMUN 2027',
	description: null,
	organizationName: 'THIMUN Foundation',
	organizationSlug: 'thimun-foundation',
	city: 'The Hague',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-01-25',
	endDate: '2027-01-29',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: null,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 1,
	committeeNames: [],
	tagline: null,
	venueName: null,
	venueAddress: null,
	contactEmail: null,
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: null,
	maxAge: null,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

const RUNNING_SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress',
	startedAt: '2026-01-01T09:00:00.000Z',
	endedAt: null
};

const ENDED_SESSION: CommitteeSession = {
	id: 'session-0',
	name: 'Session 0',
	status: 'ended',
	startedAt: '2025-12-31T09:00:00.000Z',
	endedAt: '2025-12-31T12:00:00.000Z'
};

const SEAT_FR: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: null };
const SEAT_DE: RoomSeat = { id: 'seat-de', name: 'Germany', countryCode: 'DE', delegateName: null };
const SEAT_UK: RoomSeat = {
	id: 'seat-uk',
	name: 'United Kingdom',
	countryCode: 'GB',
	delegateName: null
};

/** France's seat is marked absent, so it is never offered as a seat to yield to. */
const ATTENDANCE: Record<string, AttendanceStatus> = { 'seat-uk': 'absent' };

const SPEAKING_ENTRY: RoomSpeaker = {
	id: 'entry-fr',
	position: 0,
	status: 'speaking',
	seat: SEAT_FR
};

const SPEAKERS_LIST: SpeakersListSummary = {
	id: 'list-1',
	name: "General Speakers' List",
	speakingTimeSeconds: 60,
	isOpen: true
};

/** The frame `openRoom` reads at the top of every action, with a sane default room. */
function makeFrame(overrides: Partial<ChairRoomFrame> = {}): ChairRoomFrame {
	return {
		committeeState: {
			currentSessionId: RUNNING_SESSION.id,
			mode: 'formal_debate',
			currentMotionId: null,
			activeSpeakersListId: SPEAKERS_LIST.id,
			currentSpeakerEntryId: null,
			currentVoteId: null,
			agendaTopic: null,
			timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
		},
		sessions: [RUNNING_SESSION],
		currentSession: RUNNING_SESSION,
		currentMotion: null,
		seats: [SEAT_FR, SEAT_DE, SEAT_UK],
		attendance: ATTENDANCE,
		latestRollCallId: null,
		...overrides
	};
}

/**
 * A post to one of the room's actions.
 *
 * The action name only decides which query parameter SvelteKit would see in
 * a real request; the actions object below is called directly, so it is here
 * to make each test's address read the way the real form's would. `fromView`
 * is the page the console's frame says the chair pressed on, which it puts
 * in the action's address (`chairFrameAction`): `?fromView=motions&/setAgenda`.
 */
function makeActionEvent(
	actionName: string,
	fields: Record<string, string> = {},
	fromView: string | null = null
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	const query = fromView === null ? '' : `fromView=${fromView}&`;

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${CHAIR_PATH}?${query}/${actionName}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/**
 * The page `load`'s event. `parent()` is a promise for whatever the chair
 * layout's own `load` returned, so the stand-in answers the fields this
 * `load` reads out of it.
 */
function makeLoadEvent(
	search = '',
	currentSession: CommitteeSession | null = RUNNING_SESSION,
	mode: CommitteeMode = 'formal_debate'
): PageServerLoadEvent {
	const frame = makeFrame();

	return {
		params: { slug: CONFERENCE_SLUG, committeeSlug: COMMITTEE_SLUG },
		url: new URL(`http://localhost${CHAIR_PATH}${search}`),
		locals: { supabase: SUPABASE },
		depends: vi.fn(),
		parent: async () => ({
			conference: CONFERENCE,
			committee: COMMITTEE,
			committeeState: { ...frame.committeeState, mode },
			seats: frame.seats,
			sessions: currentSession === null ? [] : [currentSession],
			currentSession
		})
	} as unknown as PageServerLoadEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing, so catching it is the only way to
 * see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `fail(400, ...)` gives back: a value the action returns, not throws. */
type FailResult = { status: number; data: { flash: { tone: string; message: string } } };

const CHAIR_ROOM_URL = chairRoomUrl(CONFERENCE_SLUG, COMMITTEE_SLUG);

/** Every view's data as `readLiveRoomViews` answers while none has anything to draw. */
const NO_VIEWS = { gsl: null, mod: null, unmod: null, single: null, voteView: null };

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);

	vi.mocked(requireCommitteePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'amira@example.com' },
		conference: CONFERENCE,
		committee: COMMITTEE
	});
	vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame());
	// A pass-through stand-in, so the actions' calls to `updateCommitteeState`
	// can be checked against the real database columns a `TimerSetting` writes.
	vi.mocked(timerColumns).mockImplementation((setting) => ({
		timer_total_seconds: setting.totalSeconds,
		timer_ends_at: setting.endsAt,
		timer_paused_remaining_seconds: setting.pausedRemainingSeconds
	}));
	vi.mocked(updateCommitteeState).mockResolvedValue(undefined);
	vi.mocked(setRoomMode).mockResolvedValue(undefined);
	vi.mocked(suspendRoom).mockResolvedValue(undefined);
	vi.mocked(resumeRoom).mockResolvedValue(undefined);
	vi.mocked(setSuspensionReturn).mockResolvedValue(undefined);
	vi.mocked(startSessionOnServer).mockResolvedValue(undefined);
	vi.mocked(readIsQuickSession).mockResolvedValue(false);
	vi.mocked(readLobbyFacts).mockResolvedValue(LOBBY_FACTS);
	vi.mocked(readSuspendedRoom).mockResolvedValue(SUSPENDED_ROOM);
	vi.mocked(endSessionOnServer).mockResolvedValue(undefined);
	vi.mocked(getActiveSpeakersList).mockResolvedValue({ speakersList: null, speakers: [] });
	vi.mocked(moveToNextSpeaker).mockResolvedValue('moved');
	vi.mocked(yieldToChairOnServer).mockResolvedValue(undefined);
	vi.mocked(yieldToSeatOnServer).mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
	vi.mocked(readLiveRoomViews).mockResolvedValue(NO_VIEWS);
	vi.mocked(addCommitteeTopic).mockResolvedValue(undefined);
	vi.mocked(setAgendaTopic).mockResolvedValue(undefined);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('the room gate', () => {
	it('lets the 404 requireCommitteePermission throws for a reader who may not run this room propagate', async () => {
		vi.mocked(requireCommitteePermission).mockImplementation(() => {
			error(404, 'This committee does not exist.');
		});

		await expect(actions.startSession(makeActionEvent('startSession'))).rejects.toMatchObject({
			status: 404
		});
	});
});

describe('startSession', () => {
	it('refuses to start a second session while one is already running', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ sessions: [RUNNING_SESSION] }));

		const result = (await actions.startSession(makeActionEvent('startSession'))) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.sessionRunning });
		expect(startSessionOnServer).not.toHaveBeenCalled();
	});

	it('refuses a session name longer than the database allows', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ sessions: [ENDED_SESSION] }));

		const result = (await actions.startSession(
			makeActionEvent('startSession', { name: 'x'.repeat(121) })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.sessionNameTooLong });
		expect(startSessionOnServer).not.toHaveBeenCalled();
	});

	it('opens the named session and sends the chair back to the room', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ sessions: [ENDED_SESSION] }));

		const redirect = await catchRedirect(() =>
			actions.startSession(makeActionEvent('startSession', { name: 'Opening Session' }))
		);

		expect(startSessionOnServer).toHaveBeenCalledWith(SUPABASE, COMMITTEE, 'Opening Session', NOW);
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});

	it('names an untitled session after the sessions started since the first day', async () => {
		// The conference began a month before NOW, and ENDED_SESSION ran after that.
		vi.mocked(requireCommitteePermission).mockResolvedValue({
			user: { id: 'user-1', email: 'amira@example.com' },
			conference: { ...CONFERENCE, startDate: '2025-12-01' },
			committee: COMMITTEE
		});
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ sessions: [ENDED_SESSION] }));

		await catchRedirect(() => actions.startSession(makeActionEvent('startSession')));

		expect(startSessionOnServer).toHaveBeenCalledWith(SUPABASE, COMMITTEE, 'Session 2', NOW);
	});

	it('names an untitled session before the first day a practice session', async () => {
		// CONFERENCE starts in 2027, a year after NOW; ENDED_SESSION was a practice.
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ sessions: [ENDED_SESSION] }));

		await catchRedirect(() => actions.startSession(makeActionEvent('startSession')));

		expect(startSessionOnServer).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE,
			'Practice session 2',
			NOW
		);
	});
});

describe('endSession', () => {
	it('refuses a post with no confirmation', async () => {
		const result = (await actions.endSession(makeActionEvent('endSession'))) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({
			tone: 'error',
			message: 'Please confirm before ending the session.'
		});
		expect(endSessionOnServer).not.toHaveBeenCalled();
	});

	it('refuses to end a session when none is running', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ currentSession: null }));

		const result = (await actions.endSession(
			makeActionEvent('endSession', { confirm: '1' })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.noSessionRunning });
		expect(endSessionOnServer).not.toHaveBeenCalled();
	});

	it('ends the running session and says so', async () => {
		const redirect = await catchRedirect(() =>
			actions.endSession(makeActionEvent('endSession', { confirm: '1' }))
		);

		expect(endSessionOnServer).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			RUNNING_SESSION.id,
			NOW
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Session ended.' });
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('setAgenda', () => {
	it("refuses a topic that is not one of the committee's", async () => {
		const result = (await actions.setAgenda(
			makeActionEvent('setAgenda', { topic: 'Sanctions' })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.agendaTopic });
		expect(setAgendaTopic).not.toHaveBeenCalled();
	});

	it('puts the chosen topic on the floor and says so', async () => {
		const redirect = await catchRedirect(() =>
			actions.setAgenda(makeActionEvent('setAgenda', { topic: 'Protection of civilians' }))
		);

		expect(setAgendaTopic).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'Protection of civilians');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Agenda set: Protection of civilians.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});

	it('leaves the chair on the view the agenda menu was pressed on', async () => {
		const redirect = await catchRedirect(() =>
			actions.setAgenda(
				makeActionEvent('setAgenda', { topic: 'Protection of civilians' }, 'motions')
			)
		);

		expect(redirect.location).toBe(`${CHAIR_ROOM_URL}/motions`);
	});

	it('sends the chair to the live room when the address names no page it knows', async () => {
		const redirect = await catchRedirect(() =>
			actions.setAgenda(
				makeActionEvent('setAgenda', { topic: 'Protection of civilians' }, 'nowhere')
			)
		);

		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('the frame lands a press that changes what the room is doing on the live room', () => {
	it('ends the session from another view and lands on the live room', async () => {
		const redirect = await catchRedirect(() =>
			actions.endSession(makeActionEvent('endSession', { confirm: '1' }, 'motions'))
		);

		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});

	it('suspends from another view and lands on the live room', async () => {
		const redirect = await catchRedirect(() =>
			actions.suspend(makeActionEvent('suspend', {}, 'voting'))
		);

		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});

	it('ends a caucus from the live strip on another view and lands on the live room', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(
			makeFrame({ committeeState: { ...makeFrame().committeeState, mode: 'unmoderated_caucus' } })
		);

		const redirect = await catchRedirect(() =>
			actions.endCaucus(makeActionEvent('endCaucus', {}, 'motions'))
		);

		expect(setRoomMode).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			expect.objectContaining({ mode: 'unmoderated_caucus' }),
			'formal_debate'
		);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe("every live view's actions", () => {
	it('are all on the live room, each under its own name, so none hides another', () => {
		const back = () => CHAIR_ROOM_URL;
		const factories = [
			floorActions(back),
			queueActions(back),
			caucusActions(back),
			singleSpeakerActions(),
			voteActions(back)
		];
		const viewActionNames = factories.flatMap((factory) => Object.keys(factory));
		const ownActionNames = [
			'startSession',
			'endSession',
			'suspend',
			'setReturnTime',
			'resume',
			'setAgenda',
			'addTopic'
		];

		expect(new Set(viewActionNames).size).toBe(viewActionNames.length);
		expect(Object.keys(actions).sort()).toEqual([...ownActionNames, ...viewActionNames].sort());
	});
});

describe('addTopic', () => {
	it('refuses outside a quick session, whose topics are its organisers’', async () => {
		const result = (await actions.addTopic(
			makeActionEvent('addTopic', { topic: 'Sanctions' })
		)) as FailResult;

		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.topicsElsewhere });
		expect(addCommitteeTopic).not.toHaveBeenCalled();
	});

	it('refuses an empty topic', async () => {
		vi.mocked(readIsQuickSession).mockResolvedValue(true);

		const result = (await actions.addTopic(
			makeActionEvent('addTopic', { topic: '   ' })
		)) as FailResult;

		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.newTopicEmpty });
	});

	it('refuses a fifty-first topic in a sentence, before the database refuses it', async () => {
		vi.mocked(readIsQuickSession).mockResolvedValue(true);
		vi.mocked(requireCommitteePermission).mockResolvedValue({
			user: { id: 'user-1', email: 'amira@example.com' },
			conference: CONFERENCE,
			committee: {
				...COMMITTEE,
				topics: Array.from({ length: 50 }, (_, index) => `Topic ${index + 1}`)
			}
		});

		const result = (await actions.addTopic(
			makeActionEvent('addTopic', { topic: 'Sanctions' })
		)) as FailResult;

		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.tooManyTopics });
		expect(addCommitteeTopic).not.toHaveBeenCalled();
	});

	it('adds the topic, sets it as the agenda and leaves the chair on their view', async () => {
		vi.mocked(readIsQuickSession).mockResolvedValue(true);

		const redirect = await catchRedirect(() =>
			actions.addTopic(makeActionEvent('addTopic', { topic: '  Sanctions ' }, 'gsl'))
		);

		expect(addCommitteeTopic).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			COMMITTEE.topics,
			'Sanctions'
		);
		expect(setAgendaTopic).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'Sanctions');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Agenda set: Sanctions.'
		});
		expect(redirect.location).toBe(`${CHAIR_ROOM_URL}/gsl`);
	});
});

describe('the live strip', () => {
	it('pauses the live clock and leaves the chair on the view they pressed it on', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(
			makeFrame({
				committeeState: {
					...makeFrame().committeeState,
					timer: {
						totalSeconds: 60,
						endsAt: new Date(NOW.getTime() + 30 * 1000).toISOString(),
						pausedRemainingSeconds: null
					}
				}
			})
		);

		const redirect = await catchRedirect(() =>
			actions.timerPause(makeActionEvent('timerPause', {}, 'motions'))
		);

		expect(updateCommitteeState).toHaveBeenCalled();
		expect(redirect.location).toBe(`${CHAIR_ROOM_URL}/motions`);
	});
});

describe('timerStart', () => {
	it('refuses a time outside 1 second to 60 minutes', async () => {
		const result = (await actions.timerStart(
			makeActionEvent('timerStart', { seconds: '0' })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.timerSeconds });
		expect(updateCommitteeState).not.toHaveBeenCalled();
	});

	it('starts a fresh timer for the chosen seconds', async () => {
		const redirect = await catchRedirect(() =>
			actions.timerStart(makeActionEvent('timerStart', { seconds: '120' }))
		);

		expect(updateCommitteeState).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, {
			timer_total_seconds: 120,
			timer_ends_at: new Date(NOW.getTime() + 120 * 1000).toISOString(),
			timer_paused_remaining_seconds: null
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('timerPause', () => {
	it('refuses to pause a timer that is not running', async () => {
		// The default frame's timer has no `endsAt`, so there is nothing running.
		const result = (await actions.timerPause(makeActionEvent('timerPause'))) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.timerNotRunning });
		expect(updateCommitteeState).not.toHaveBeenCalled();
	});

	it('pauses the running timer with the seconds it had left', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(
			makeFrame({
				committeeState: {
					...makeFrame().committeeState,
					timer: {
						totalSeconds: 60,
						endsAt: new Date(NOW.getTime() + 45 * 1000).toISOString(),
						pausedRemainingSeconds: null
					}
				}
			})
		);

		const redirect = await catchRedirect(() => actions.timerPause(makeActionEvent('timerPause')));

		expect(updateCommitteeState).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, {
			timer_total_seconds: 60,
			timer_ends_at: null,
			timer_paused_remaining_seconds: 45
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('timerResume', () => {
	it('resumes a paused timer, running again from now', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(
			makeFrame({
				committeeState: {
					...makeFrame().committeeState,
					timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 30 }
				}
			})
		);

		const redirect = await catchRedirect(() => actions.timerResume(makeActionEvent('timerResume')));

		expect(updateCommitteeState).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, {
			timer_total_seconds: 60,
			timer_ends_at: new Date(NOW.getTime() + 30 * 1000).toISOString(),
			timer_paused_remaining_seconds: null
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('timerAdd', () => {
	it('adds fifteen seconds when the button sends no number of its own', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(
			makeFrame({
				committeeState: {
					...makeFrame().committeeState,
					timer: {
						totalSeconds: 60,
						endsAt: new Date(NOW.getTime() + 10 * 1000).toISOString(),
						pausedRemainingSeconds: null
					}
				}
			})
		);

		const redirect = await catchRedirect(() => actions.timerAdd(makeActionEvent('timerAdd')));

		expect(updateCommitteeState).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, {
			timer_total_seconds: 60,
			timer_ends_at: new Date(NOW.getTime() + 25 * 1000).toISOString(),
			timer_paused_remaining_seconds: null
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('timerReset', () => {
	it('sets the timer back to its full length, paused', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(
			makeFrame({
				committeeState: {
					...makeFrame().committeeState,
					timer: {
						totalSeconds: 60,
						endsAt: new Date(NOW.getTime() + 10 * 1000).toISOString(),
						pausedRemainingSeconds: null
					}
				}
			})
		);

		const redirect = await catchRedirect(() => actions.timerReset(makeActionEvent('timerReset')));

		expect(updateCommitteeState).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, {
			timer_total_seconds: 60,
			timer_ends_at: null,
			timer_paused_remaining_seconds: 60
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('nextSpeaker', () => {
	it('refuses when there is no speakers list open', async () => {
		vi.mocked(getActiveSpeakersList).mockResolvedValue({ speakersList: null, speakers: [] });

		const result = (await actions.nextSpeaker(makeActionEvent('nextSpeaker'))) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.noSpeakersList });
		expect(moveToNextSpeaker).not.toHaveBeenCalled();
	});

	it('moves the floor on to the next speaker', async () => {
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: SPEAKERS_LIST,
			speakers: [SPEAKING_ENTRY]
		});
		vi.mocked(moveToNextSpeaker).mockResolvedValue('moved');
		const frame = makeFrame();
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);

		const redirect = await catchRedirect(() => actions.nextSpeaker(makeActionEvent('nextSpeaker')));

		expect(moveToNextSpeaker).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			frame.committeeState,
			{ speakersList: SPEAKERS_LIST, speakers: [SPEAKING_ENTRY] },
			NOW
		);
		expect(setFlash).not.toHaveBeenCalled();
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});

	it('says the list is empty when nobody was waiting', async () => {
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: SPEAKERS_LIST,
			speakers: []
		});
		vi.mocked(moveToNextSpeaker).mockResolvedValue('empty');

		const redirect = await catchRedirect(() => actions.nextSpeaker(makeActionEvent('nextSpeaker')));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'info', message: 'The list is empty.' });
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('yieldToChair', () => {
	it('refuses when nobody has the floor', async () => {
		const result = (await actions.yieldToChair(makeActionEvent('yieldToChair'))) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.nobodySpeaking });
		expect(yieldToChairOnServer).not.toHaveBeenCalled();
	});

	it('gives the floor back to the chair', async () => {
		const frame = makeFrame({
			committeeState: { ...makeFrame().committeeState, currentSpeakerEntryId: SPEAKING_ENTRY.id }
		});
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: SPEAKERS_LIST,
			speakers: [SPEAKING_ENTRY]
		});

		const redirect = await catchRedirect(() =>
			actions.yieldToChair(makeActionEvent('yieldToChair'))
		);

		expect(yieldToChairOnServer).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			frame.committeeState,
			{ speakersList: SPEAKERS_LIST, speakers: [SPEAKING_ENTRY] },
			NOW
		);
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('endSpeech', () => {
	it('refuses when nobody has the floor', async () => {
		const result = (await actions.endSpeech(makeActionEvent('endSpeech'))) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.nobodySpeaking });
		expect(yieldToChairOnServer).not.toHaveBeenCalled();
		expect(moveToNextSpeaker).not.toHaveBeenCalled();
	});

	it('ends the speech and clears the floor without calling the next speaker', async () => {
		const frame = makeFrame({
			committeeState: { ...makeFrame().committeeState, currentSpeakerEntryId: SPEAKING_ENTRY.id }
		});
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: SPEAKERS_LIST,
			speakers: [SPEAKING_ENTRY]
		});

		const redirect = await catchRedirect(() => actions.endSpeech(makeActionEvent('endSpeech')));

		expect(yieldToChairOnServer).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			frame.committeeState,
			{ speakersList: SPEAKERS_LIST, speakers: [SPEAKING_ENTRY] },
			NOW
		);
		expect(moveToNextSpeaker).not.toHaveBeenCalled();
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('the speaking queue', () => {
	const WAITING_ENTRY: RoomSpeaker & { spokeSeconds: null } = {
		id: 'entry-de',
		position: 1,
		status: 'waiting',
		seat: SEAT_DE,
		spokeSeconds: null
	};

	beforeEach(() => {
		vi.mocked(getSpeakersLists).mockResolvedValue([
			{ speakersList: SPEAKERS_LIST, speakers: [WAITING_ENTRY] }
		]);
		vi.mocked(addSpeaker).mockResolvedValue(undefined);
		vi.mocked(removeSpeaker).mockResolvedValue(undefined);
	});

	it('adds a present seat to the list and comes back to the room', async () => {
		const redirect = await catchRedirect(() =>
			actions.add(makeActionEvent('add', { listId: SPEAKERS_LIST.id, seatId: SEAT_FR.id }))
		);

		expect(addSpeaker).toHaveBeenCalledWith(SUPABASE, SPEAKERS_LIST.id, SEAT_FR.id, 2, null);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});

	it('removes a waiting entry and comes back to the room', async () => {
		const redirect = await catchRedirect(() =>
			actions.remove(makeActionEvent('remove', { entryId: WAITING_ENTRY.id }))
		);

		expect(removeSpeaker).toHaveBeenCalledWith(SUPABASE, WAITING_ENTRY.id);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('yieldToSeat', () => {
	/** The room with France on the floor, as every test in this block needs. */
	function frameWithSpeaker(): ChairRoomFrame {
		return makeFrame({
			committeeState: { ...makeFrame().committeeState, currentSpeakerEntryId: SPEAKING_ENTRY.id }
		});
	}

	beforeEach(() => {
		vi.mocked(getActiveSpeakersList).mockResolvedValue({
			speakersList: SPEAKERS_LIST,
			speakers: [SPEAKING_ENTRY]
		});
	});

	it('refuses when nobody has the floor to yield', async () => {
		const result = (await actions.yieldToSeat(
			makeActionEvent('yieldToSeat', { seatId: SEAT_DE.id })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.nobodySpeaking });
		expect(yieldToSeatOnServer).not.toHaveBeenCalled();
	});

	it('refuses a seat that is marked absent at the latest roll call', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(frameWithSpeaker());

		const result = (await actions.yieldToSeat(
			makeActionEvent('yieldToSeat', { seatId: SEAT_UK.id })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.yieldSeat });
		expect(yieldToSeatOnServer).not.toHaveBeenCalled();
	});

	it('refuses the speaker’s own seat', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(frameWithSpeaker());

		const result = (await actions.yieldToSeat(
			makeActionEvent('yieldToSeat', { seatId: SEAT_FR.id })
		)) as FailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: ROOM_REFUSALS.yieldSeat });
		expect(yieldToSeatOnServer).not.toHaveBeenCalled();
	});

	it('gives the floor to a present seat that is not the speaker’s own', async () => {
		const frame = frameWithSpeaker();
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);

		const redirect = await catchRedirect(() =>
			actions.yieldToSeat(makeActionEvent('yieldToSeat', { seatId: SEAT_DE.id }))
		);

		expect(yieldToSeatOnServer).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			frame.committeeState,
			{ speakersList: SPEAKERS_LIST, speakers: [SPEAKING_ENTRY] },
			SEAT_DE.id,
			NOW,
			null
		);
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});

	it('saves the new entry under the id the chair’s browser chose (T141)', async () => {
		const frame = frameWithSpeaker();
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);
		const fields = { seatId: SEAT_DE.id, newRowId: '5b2f8c1e-9d3a-4e7b-8c6f-1a2b3c4d5e6f' };

		await catchRedirect(() => actions.yieldToSeat(makeActionEvent('yieldToSeat', fields)));

		expect(vi.mocked(yieldToSeatOnServer).mock.calls[0][6]).toBe(
			'5b2f8c1e-9d3a-4e7b-8c6f-1a2b3c4d5e6f'
		);
	});
});

/** What the lobby and the ended screen read, as `readLobbyFacts` answers. */
const LOBBY_FACTS = {
	filledSeatCount: 2,
	lastSessionRecord: null,
	nextScheduleEvent: null,
	isQuickSession: false
};

/** What the suspended screen reads, as `readSuspendedRoom` answers. */
const SUSPENDED_ROOM = { speakers: [], voteSubject: null, reason: 'for lunch' };

/** The room in a running session, suspended from formal debate. */
function suspendedFrame(): ChairRoomFrame {
	const frame = makeFrame();

	return makeFrame({
		committeeState: {
			...frame.committeeState,
			mode: 'suspended',
			suspendedAt: '2026-01-01T09:50:00.000Z',
			suspendedUntil: null,
			modeBeforeSuspension: 'formal_debate'
		}
	});
}

describe('startSession in a quick session', () => {
	it('never names a practice session, however early the day (S14)', async () => {
		// CONFERENCE starts in 2027, a year after NOW, which would make it a practice session.
		vi.mocked(readIsQuickSession).mockResolvedValue(true);
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ sessions: [ENDED_SESSION] }));

		await catchRedirect(() => actions.startSession(makeActionEvent('startSession')));

		expect(readIsQuickSession).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(startSessionOnServer).toHaveBeenCalledWith(SUPABASE, COMMITTEE, 'Session 2', NOW);
	});
});

describe('suspend', () => {
	it('refuses while no session is running', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(makeFrame({ currentSession: null }));

		const result = (await actions.suspend(makeActionEvent('suspend'))) as FailResult;

		expect(result.data.flash.message).toBe(ROOM_REFUSALS.noSessionRunning);
		expect(suspendRoom).not.toHaveBeenCalled();
	});

	it('refuses a room that is already suspended', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(suspendedFrame());

		const result = (await actions.suspend(makeActionEvent('suspend'))) as FailResult;

		expect(result.data.flash.message).toBe(SUSPENSION_REFUSALS.alreadySuspended);
		expect(suspendRoom).not.toHaveBeenCalled();
	});

	it('suspends at the moment pressed and lands on the live room, from any view', async () => {
		const frame = makeFrame();
		vi.mocked(getChairRoomFrame).mockResolvedValue(frame);
		const pressedAt = '2026-01-01T09:59:58.000Z';

		const redirect = await catchRedirect(() =>
			actions.suspend(makeActionEvent('suspend', { pressedAt }, 'motions'))
		);

		expect(suspendRoom).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			frame.committeeState,
			new Date(pressedAt)
		);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

describe('setReturnTime', () => {
	it('refuses while the room is not suspended', async () => {
		const result = (await actions.setReturnTime(
			makeActionEvent('setReturnTime', { minutes: '15' })
		)) as FailResult;

		expect(result.data.flash.message).toBe(SUSPENSION_REFUSALS.notSuspended);
		expect(setSuspensionReturn).not.toHaveBeenCalled();
	});

	it('writes the press plus the minutes a button sent, rounded up to the minute', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(suspendedFrame());

		const redirect = await catchRedirect(() =>
			actions.setReturnTime(
				makeActionEvent('setReturnTime', { minutes: '15', pressedAt: '2026-01-01T09:59:30.000Z' })
			)
		);

		expect(setSuspensionReturn).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			'2026-01-01T10:15:00.000Z'
		);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});

	it("writes a typed time, today in the conference's timezone", async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(suspendedFrame());

		// 13:30 in Amsterdam in January is 12:30 UTC.
		await catchRedirect(() =>
			actions.setReturnTime(makeActionEvent('setReturnTime', { backAt: '13:30' }))
		);

		expect(setSuspensionReturn).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			'2026-01-01T12:30:00.000Z'
		);
	});

	it('refuses a time it cannot read, and a time that has passed', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(suspendedFrame());

		const unreadable = (await actions.setReturnTime(
			makeActionEvent('setReturnTime', { backAt: 'after lunch' })
		)) as FailResult;
		const passed = (await actions.setReturnTime(
			makeActionEvent('setReturnTime', { backAt: '08:00' })
		)) as FailResult;

		expect(unreadable.data.flash.message).toBe(RETURN_TIME_REFUSALS.unreadable);
		expect(passed.data.flash.message).toBe(RETURN_TIME_REFUSALS.notLater);
		expect(setSuspensionReturn).not.toHaveBeenCalled();
	});
});

describe('resume', () => {
	it('refuses while the room is not suspended', async () => {
		const result = (await actions.resume(makeActionEvent('resume'))) as FailResult;

		expect(result.data.flash.message).toBe(SUSPENSION_REFUSALS.notSuspended);
		expect(resumeRoom).not.toHaveBeenCalled();
	});

	it('puts back what was suspended and lands on the live room', async () => {
		vi.mocked(getChairRoomFrame).mockResolvedValue(suspendedFrame());

		const redirect = await catchRedirect(() => actions.resume(makeActionEvent('resume')));

		expect(resumeRoom).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(redirect.location).toBe(CHAIR_ROOM_URL);
	});
});

/** What `load` answered, as much of it as these tests look at. */
type LoadedRoom = {
	lobbyFacts: typeof LOBBY_FACTS;
	gsl: unknown;
	mod: unknown;
	voteView: unknown;
	suspendedRoom: typeof SUSPENDED_ROOM | null;
	isTimeFieldOpen: boolean;
};

describe('load', () => {
	it("reads the live mode's view with the readers its own route calls, and the address's questions", async () => {
		const gsl = {
			speakersList: {
				id: 'list-gsl',
				name: "General Speakers' List",
				speakingTimeSeconds: 90,
				isOpen: true
			},
			speakers: []
		};
		const caucus = { list: null, motion: null };
		vi.mocked(readLiveRoomViews).mockResolvedValue({ ...NO_VIEWS, gsl, mod: caucus });

		const event = makeLoadEvent('?time=change');
		const result = (await load(event)) as LoadedRoom;

		expect(readLiveRoomViews).toHaveBeenCalledWith(
			SUPABASE,
			{
				committeeId: 'committee-1',
				committeeState: makeFrame().committeeState,
				currentSession: RUNNING_SESSION,
				seats: makeFrame().seats
			},
			event.url
		);
		expect(result.gsl).toBe(gsl);
		expect(result.mod).toBe(caucus);
		expect(result.voteView).toBeNull();
		expect(result.isTimeFieldOpen).toBe(true);
		expect(result.suspendedRoom).toBeNull();
	});

	it('reads the lobby facts in every state, telling them whether a session runs', async () => {
		const running = (await load(makeLoadEvent())) as LoadedRoom;

		expect(running.lobbyFacts).toBe(LOBBY_FACTS);
		expect(readLobbyFacts).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			committeeId: COMMITTEE.id,
			sessions: [RUNNING_SESSION],
			isSessionRunning: true,
			now: NOW
		});

		await load(makeLoadEvent('', null));

		expect(vi.mocked(readLobbyFacts).mock.calls[1][1].isSessionRunning).toBe(false);
	});

	it('reads no suspended room while no session runs', async () => {
		const result = (await load(makeLoadEvent('', null))) as LoadedRoom;

		expect(readSuspendedRoom).not.toHaveBeenCalled();
		expect(result.gsl).toBeNull();
		expect(result.isTimeFieldOpen).toBe(false);
	});

	it('reads what the suspended screen needs while the room is suspended', async () => {
		const result = (await load(makeLoadEvent('', RUNNING_SESSION, 'suspended'))) as LoadedRoom;

		expect(readSuspendedRoom).toHaveBeenCalled();
		expect(result.suspendedRoom).toBe(SUSPENDED_ROOM);
	});
});
