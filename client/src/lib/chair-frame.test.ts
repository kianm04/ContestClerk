import { describe, expect, it } from 'vitest';
import type { RoomFrame } from '$lib/chair-form';
import {
	attendanceChipText,
	consoleFrame,
	chairFrameLinks,
	chairPageOfRoute,
	chairRole,
	committeeMenuLinks,
	committeeToolsFor,
	framePresence,
	frameRoomState,
	hasOwnPageHeader,
	hasPresentSeatWaiting,
	isCommitteeNameHeading,
	isSessionInProgress,
	keyTargetOf,
	liveStripControls,
	liveStripLine,
	readShortcutsSetting,
	rollCallReturnPage,
	sessionControlsOf,
	sessionRunningTime,
	sessionsAfterFrame,
	shortcutsSettingValue,
	stripNextSpeaker,
	tabKeyShortcuts,
	type ConsoleData,
	type FocusedElement,
	type LiveStripRoom
} from '$lib/chair-frame';
import type { CommitteeSession, RoomSpeaker } from '$lib/chair-room';
import { CLEARED_TIMER, type RoomSeat } from '$lib/committee-room';
import type { InstantPress } from '$lib/instant-form.svelte';

const RUNNING: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'in_progress',
	startedAt: '2020-05-05T07:00:00Z',
	endedAt: null
};

/** A room running `RUNNING` in formal debate, changed by `changes`. */
function frameWith(changes: Partial<RoomFrame['committeeState']> = {}): RoomFrame {
	return {
		committeeState: {
			currentSessionId: RUNNING.id,
			mode: 'formal_debate',
			currentMotionId: null,
			activeSpeakersListId: 'list-1',
			currentSpeakerEntryId: null,
			currentVoteId: null,
			agendaTopic: null,
			timer: CLEARED_TIMER,
			...changes
		},
		currentSession: RUNNING,
		currentMotion: null
	};
}

const FACTS = {
	sessions: [RUNNING],
	today: '2020-05-05',
	timezone: 'Europe/Amsterdam'
};

/** "Mark all present" from the Room page's opening card, which names no roll call (R2). */
const MARK_ALL_PRESENT: InstantPress = {
	id: 1,
	formData: new FormData(),
	action: new URL('http://localhost/roll-call?/markAllPresent'),
	expected: null
};

describe('frameRoomState', () => {
	it('is the opening while roll call and agenda are to do and nobody has spoken', () => {
		expect(frameRoomState(frameWith(), FACTS)).toBe('opening');
	});

	it('takes a current speaker as a sign that someone has spoken', () => {
		const frame = frameWith({ currentSpeakerEntryId: 'entry-1' });

		expect(frameRoomState(frame, FACTS)).toBe('debate');
	});

	it("takes the layout's answer about who has spoken in the session", () => {
		expect(frameRoomState(frameWith(), { ...FACTS, hasAnyoneSpoken: true })).toBe('debate');
	});

	it('stays in the opening once the agenda is set, until a speaker is called (S5)', () => {
		expect(frameRoomState(frameWith({ agendaTopic: 'Water' }), FACTS)).toBe('opening');
	});

	it('is suspended while the room is suspended', () => {
		expect(frameRoomState(frameWith({ mode: 'suspended' }), FACTS)).toBe('suspended');
	});

	it('is in the lobby without a session', () => {
		const frame = { ...frameWith({ currentSessionId: null }), currentSession: null };

		expect(frameRoomState(frame, { ...FACTS, sessions: [] })).toBe('lobby');
	});

	it('is ended the moment "End session" is pressed, before the server answers', () => {
		// 16:58 in Amsterdam on the conference's today.
		const endedCopy: CommitteeSession = {
			...RUNNING,
			status: 'ended',
			endedAt: '2020-05-05T14:58:00Z'
		};
		const frame = { ...frameWith({ mode: 'idle' }), currentSession: endedCopy };

		expect(frameRoomState(frame, FACTS)).toBe('ended');
	});
});

describe('sessionsAfterFrame', () => {
	const EARLIER: CommitteeSession = { ...RUNNING, id: 'session-0', status: 'ended' };
	const ENDED_COPY: CommitteeSession = {
		...RUNNING,
		status: 'ended',
		endedAt: '2020-05-05T15:00:00Z'
	};

	it("puts the frame's copy of its session in place of the stored one", () => {
		expect(sessionsAfterFrame([RUNNING, EARLIER], ENDED_COPY)).toEqual([ENDED_COPY, EARLIER]);
	});

	it('puts a session the list does not have yet first', () => {
		expect(sessionsAfterFrame([EARLIER], RUNNING)).toEqual([RUNNING, EARLIER]);
	});

	it('leaves the list alone when the frame has no session', () => {
		const sessions = [EARLIER];

		expect(sessionsAfterFrame(sessions, null)).toBe(sessions);
	});
});

describe('isSessionInProgress', () => {
	it('is true while a session is open, running or suspended, and false otherwise', () => {
		expect(isSessionInProgress('opening')).toBe(true);
		expect(isSessionInProgress('debate')).toBe(true);
		expect(isSessionInProgress('suspended')).toBe(true);
		expect(isSessionInProgress('lobby')).toBe(false);
		expect(isSessionInProgress('ended')).toBe(false);
	});
});

describe('chairRole', () => {
	it('shows a chair who does not organise nothing', () => {
		expect(chairRole(false, true, 'thimun-2027')).toBeNull();
	});

	it('tells an organiser who does not chair here that they are viewing as organiser', () => {
		expect(chairRole(true, false, 'thimun-2027')).toEqual({
			label: 'Viewing as organiser',
			dashboardHref: '/manage/thimun-2027'
		});
	});

	it('calls an organiser who also chairs this committee "Chair"', () => {
		expect(chairRole(true, true, 'thimun-2027')?.label).toBe('Chair');
	});

	it('shows a quick session’s chair, its organiser too, no role line and no dashboard', () => {
		expect(chairRole(true, true, 'quick-abcdefghij', true)).toBeNull();
	});
});

describe('framePresence', () => {
	it('counts nobody before the first roll call', () => {
		expect(framePresence({}, null, [], ['a', 'b', 'c', 'd'])).toEqual({
			presentCount: null,
			availableSeats: 4,
			hasQuorum: false
		});
	});

	it('counts every seat not marked absent, and whether that makes quorum', () => {
		const attendance = { a: 'present', b: 'present_and_voting', c: 'absent' } as const;

		expect(framePresence(attendance, 'roll-call-1', [], ['a', 'b', 'c', 'd'])).toEqual({
			presentCount: 2,
			availableSeats: 4,
			hasQuorum: true
		});
	});

	it('counts the first roll call the moment "Mark all present" is pressed', () => {
		expect(framePresence({}, null, [MARK_ALL_PRESENT], ['a', 'b', 'c', 'd'])).toEqual({
			presentCount: 4,
			availableSeats: 4,
			hasQuorum: true
		});
	});
});

describe('attendanceChipText', () => {
	it('asks for a roll call before the session has one, in the neutral tone', () => {
		const presence = { presentCount: null, availableSeats: 6, hasQuorum: false };

		expect(attendanceChipText(presence, true)).toEqual({
			count: 'Take roll call',
			word: '',
			detail: '',
			isWarning: false
		});
	});

	it('counts who is present and says quorum is met', () => {
		const presence = { presentCount: 5, availableSeats: 6, hasQuorum: true };

		expect(attendanceChipText(presence, false)).toEqual({
			count: '5/6',
			word: ' present',
			detail: ' · quorum met',
			isWarning: false
		});
	});

	it('counts what is still needed during the opening, neutral while the roll is taken', () => {
		const presence = { presentCount: 3, availableSeats: 8, hasQuorum: false };

		expect(attendanceChipText(presence, true)).toEqual({
			count: '3/8',
			word: ' present',
			detail: ' · 1 more needed',
			isWarning: false
		});
	});

	it('warns of a missing quorum once debate has started', () => {
		const presence = { presentCount: 3, availableSeats: 8, hasQuorum: false };

		expect(attendanceChipText(presence, false)).toEqual({
			count: '3/8',
			word: ' present',
			detail: ' · no quorum',
			isWarning: true
		});
	});
});

describe('sessionRunningTime', () => {
	const STARTED = '2020-05-05T09:00:00Z';

	it('writes hours, minutes and seconds once the session has run an hour', () => {
		expect(sessionRunningTime(STARTED, new Date('2020-05-05T10:12:40Z'))).toBe('1:12:40');
		expect(sessionRunningTime(STARTED, new Date('2020-05-05T12:00:05Z'))).toBe('3:00:05');
	});

	it('writes minutes and seconds before that, the way the clocks do', () => {
		expect(sessionRunningTime(STARTED, new Date('2020-05-05T09:12:40Z'))).toBe('12:40');
		expect(sessionRunningTime(STARTED, new Date('2020-05-05T09:00:07Z'))).toBe('0:07');
	});

	it('never counts below zero when the browser runs behind', () => {
		expect(sessionRunningTime(STARTED, new Date('2020-05-05T08:59:00Z'))).toBe('0:00');
	});
});

describe('chairPageOfRoute', () => {
	const CHAIR = '/conferences/[slug]/committees/[committeeSlug]/chair';

	it('names the live room and each page under it', () => {
		expect(chairPageOfRoute(CHAIR)).toBe('chair');
		expect(chairPageOfRoute(`${CHAIR}/gsl`)).toBe('gsl');
		expect(chairPageOfRoute(`${CHAIR}/motions`)).toBe('motions');
		expect(chairPageOfRoute(`${CHAIR}/voting`)).toBe('voting');
		expect(chairPageOfRoute(`${CHAIR}/roll-call`)).toBe('roll-call');
		expect(chairPageOfRoute(`${CHAIR}/awards`)).toBe('awards');
	});

	it('names a deeper page by the page it sits under', () => {
		expect(chairPageOfRoute(`${CHAIR}/notes/sessions/[sessionId]`)).toBe('notes');
		expect(chairPageOfRoute(`${CHAIR}/papers/[seatId]`)).toBe('papers');
		expect(chairPageOfRoute(`${CHAIR}/resolutions/[paperId]`)).toBe('resolutions');
	});

	it('counts the Speakers page, which redirects to the GSL, as the GSL', () => {
		expect(chairPageOfRoute(`${CHAIR}/speakers`)).toBe('gsl');
	});

	it('falls back to the live room for anything else', () => {
		expect(chairPageOfRoute(null)).toBe('chair');
		expect(chairPageOfRoute('/home')).toBe('chair');
	});
});

describe('hasOwnPageHeader', () => {
	it('is true for the pages that still draw their own header', () => {
		for (const page of ['papers', 'resolutions', 'notes', 'awards'] as const) {
			expect(hasOwnPageHeader(page)).toBe(true);
		}
	});

	it('is false for the live room, the rebuilt views and the roll call, whose heading is the committee', () => {
		for (const page of ['chair', 'gsl', 'motions', 'mod', 'voting', 'roll-call'] as const) {
			expect(hasOwnPageHeader(page)).toBe(false);
		}
	});
});

describe('isCommitteeNameHeading', () => {
	it('makes the committee the heading of the views, the roll call and the live room in debate', () => {
		expect(isCommitteeNameHeading('gsl', 'lobby')).toBe(true);
		expect(isCommitteeNameHeading('roll-call', 'opening')).toBe(true);
		expect(isCommitteeNameHeading('chair', 'opening')).toBe(true);
		expect(isCommitteeNameHeading('chair', 'debate')).toBe(true);
	});

	it('leaves the heading to the lobby, the suspended and the ended screens of the live room', () => {
		for (const roomState of ['lobby', 'suspended', 'ended'] as const) {
			expect(isCommitteeNameHeading('chair', roomState)).toBe(false);
		}
	});

	it('leaves the heading to a page with its own header', () => {
		expect(isCommitteeNameHeading('papers', 'debate')).toBe(false);
	});
});

describe('rollCallReturnPage', () => {
	it('is the page itself anywhere but the roll call view', () => {
		expect(rollCallReturnPage('gsl', null)).toBe('gsl');
		expect(rollCallReturnPage('motions', 'gsl')).toBe('motions');
	});

	it('keeps the page the roll call view was opened from, or the live room', () => {
		expect(rollCallReturnPage('roll-call', 'gsl')).toBe('gsl');
		expect(rollCallReturnPage('roll-call', null)).toBe('chair');
		expect(rollCallReturnPage('roll-call', 'nowhere')).toBe('chair');
	});
});

describe('tabKeyShortcuts', () => {
	it('declares the number, and M as well on Motions', () => {
		expect(tabKeyShortcuts({ view: 'gsl', keyShortcut: '1' })).toBe('1');
		expect(tabKeyShortcuts({ view: 'motions', keyShortcut: '2' })).toBe('2 M');
	});
});

/** A chair who may open all three of the committee menu's own pages. */
const EVERY_TOOL = { mayReviewPapers: true, mayWriteNotes: true, mayProposeAwards: true };

describe('committeeMenuLinks', () => {
	it('leaves out the pages the reader may not open, but always offers Resolutions', () => {
		const roomOnly = { mayReviewPapers: false, mayWriteNotes: false, mayProposeAwards: false };
		const papersOnly = { ...roomOnly, mayReviewPapers: true };

		expect(
			committeeMenuLinks('thimun-2027', 'unsc', [RUNNING], roomOnly).map((link) => link.label)
		).toEqual(['Resolutions']);
		expect(
			committeeMenuLinks('thimun-2027', 'unsc', [RUNNING], papersOnly).map((link) => link.label)
		).toEqual(['Papers', 'Resolutions']);
	});

	const ENDED: CommitteeSession = {
		...RUNNING,
		id: 'session-0',
		status: 'ended',
		endedAt: '2020-05-04T15:00:00Z'
	};

	it('offers Papers, Resolutions, Notes and Awards while no session has ended', () => {
		const links = committeeMenuLinks('thimun-2027', 'unsc', [RUNNING], EVERY_TOOL);

		expect(links).toEqual([
			{ label: 'Papers', href: '/conferences/thimun-2027/committees/unsc/chair/papers' },
			{
				label: 'Resolutions',
				href: '/conferences/thimun-2027/committees/unsc/chair/resolutions'
			},
			{ label: 'Notes', href: '/conferences/thimun-2027/committees/unsc/chair/notes' },
			{ label: 'Awards', href: '/conferences/thimun-2027/committees/unsc/chair/awards' }
		]);
	});

	it('offers "Edit delegations" in place of Awards in a quick session', () => {
		const links = committeeMenuLinks('quick-abcdefghij', 'unsc', [RUNNING], EVERY_TOOL, true);

		expect(links.map((link) => link.label)).toEqual([
			'Papers',
			'Resolutions',
			'Notes',
			'Edit delegations'
		]);
		expect(links[3].href).toBe('/quick/quick-abcdefghij/delegations');
	});

	it("adds the latest ended session's record on the Motions page", () => {
		const links = committeeMenuLinks('thimun-2027', 'unsc', [RUNNING, ENDED], EVERY_TOOL);

		expect(links.at(-1)).toEqual({
			label: 'Session record',
			href: '/conferences/thimun-2027/committees/unsc/chair/motions?session=session-0'
		});
	});
});

describe('chairFrameLinks', () => {
	it('posts to the live room with the page the chair is on, and opens the roll call from it', () => {
		const links = chairFrameLinks('thimun-2027', 'unsc', 'motions');
		const room = '/conferences/thimun-2027/committees/unsc/chair';

		expect(links.roomHref).toBe(room);
		expect(links.rollCallHref).toBe(`${room}/roll-call?from=motions`);
		expect(links.setAgendaAction).toBe(`${room}?fromView=motions&/setAgenda`);
		expect(links.suspendAction).toBe(`${room}?fromView=motions&/suspend`);
		expect(links.addTopicAction).toBe(`${room}?fromView=motions&/addTopic`);
		expect(links.displayHref).toBe('/conferences/thimun-2027/committees/unsc/display');
		expect(links.endSessionAction).toBe(`${room}?fromView=motions&/endSession`);
		expect(links.timerPauseAction).toBe(`${room}?fromView=motions&/timerPause`);
		expect(links.nextSpeakerAction).toBe(`${room}?fromView=motions&/nextSpeaker`);
	});

	it('opens the roll call from the page the roll call view itself was opened from', () => {
		const links = chairFrameLinks('thimun-2027', 'unsc', 'roll-call', 'gsl');
		const room = '/conferences/thimun-2027/committees/unsc/chair';

		expect(links.rollCallHref).toBe(`${room}/roll-call?from=gsl`);
		expect(links.setAgendaAction).toBe(`${room}?fromView=roll-call&/setAgenda`);
	});

	it('posts the plain actions from the live room itself', () => {
		const links = chairFrameLinks('thimun-2027', 'unsc', 'chair');

		expect(links.timerStartAction).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?/timerStart'
		);
		expect(links.timerResumeAction).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?/timerResume'
		);
		expect(links.timerAddAction).toBe('/conferences/thimun-2027/committees/unsc/chair?/timerAdd');
	});
});

const CHINA: RoomSeat = { id: 'seat-cn', name: 'China', countryCode: 'CN' };
const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };

/** An entry of the live list. */
function entry(id: string, seat: RoomSeat, position: number, status: RoomSpeaker['status']) {
	return { id, seat, position, status };
}

/** China speaking with 0:47 of 1:30 left at `NOW`, Kenya absent and Brazil waiting. */
const NOW = new Date('2020-05-05T10:00:00Z');
const GSL_ROOM: LiveStripRoom = {
	mode: 'formal_debate',
	timer: { totalSeconds: 90, endsAt: '2020-05-05T10:00:47Z', pausedRemainingSeconds: null },
	entries: [
		entry('entry-cn', CHINA, 1, 'speaking'),
		entry('entry-ke', KENYA, 2, 'waiting'),
		entry('entry-br', BRAZIL, 3, 'waiting')
	],
	currentSpeakerEntryId: 'entry-cn',
	attendance: { 'seat-ke': 'absent' },
	speakingTimeSeconds: 90,
	timezone: 'Europe/Amsterdam'
};

describe('liveStripLine', () => {
	it("names the mode, the speaker and the clock, with the floor's clock face for the bar", () => {
		expect(liveStripLine(GSL_ROOM, NOW)).toEqual({
			text: 'GSL · China · 0:47',
			face: { secondsLeft: 47, clockState: 'running', spokenSeconds: 43, totalSeconds: 90 }
		});
	});

	it('counts up past the end', () => {
		const over = { ...GSL_ROOM, timer: { ...GSL_ROOM.timer, endsAt: '2020-05-05T09:59:53Z' } };

		expect(liveStripLine(over, NOW).text).toBe('GSL · China · +0:07');
		expect(liveStripLine(over, NOW).face?.secondsLeft).toBe(-7);
	});

	it('says nobody has the floor, with no bar', () => {
		const empty = { ...GSL_ROOM, currentSpeakerEntryId: null };

		expect(liveStripLine(empty, NOW)).toEqual({ text: 'GSL · nobody has the floor', face: null });
	});

	it('names a moderated caucus and a single speaker the way the mode bar does', () => {
		expect(liveStripLine({ ...GSL_ROOM, mode: 'moderated_caucus' }, NOW).text).toBe(
			'Mod · China · 0:47'
		);
		expect(liveStripLine({ ...GSL_ROOM, mode: 'single_speaker' }, NOW).text).toBe(
			'Single speaker · China · 0:47'
		);
	});

	it("gives an unmoderated caucus's time left and when it ends, in the conference's time", () => {
		const unmod: LiveStripRoom = {
			...GSL_ROOM,
			mode: 'unmoderated_caucus',
			timer: { totalSeconds: 900, endsAt: '2020-05-05T10:08:42Z', pausedRemainingSeconds: null },
			entries: [],
			currentSpeakerEntryId: null
		};

		// 10:08:42 UTC is 12:08 in Amsterdam in May.
		expect(liveStripLine(unmod, NOW).text).toBe('Unmod · 8:42 left · back at 12:08');
	});
});

describe('liveStripControls', () => {
	it('offers the clock, +15 s and "Next" to the first present seat waiting', () => {
		expect(liveStripControls(GSL_ROOM)).toEqual({
			clock: { label: 'Pause', formAction: '?/timerPause' },
			addTime: { label: '+15 s', seconds: 15 },
			primary: { label: 'Next: Brazil', action: 'nextSpeaker' }
		});
	});

	it('offers only "Call" while nobody has the floor', () => {
		const empty = { ...GSL_ROOM, currentSpeakerEntryId: null };

		expect(liveStripControls(empty)).toEqual({
			clock: null,
			addTime: null,
			primary: { label: 'Call Brazil', action: 'nextSpeaker' }
		});
	});

	it('has no primary while no present seat waits', () => {
		const lastSpeaker = { ...GSL_ROOM, entries: [GSL_ROOM.entries[0]] };

		expect(liveStripControls(lastSpeaker).primary).toBeNull();
	});

	it('offers +1 min and "End caucus" in an unmoderated caucus', () => {
		const unmod = { ...GSL_ROOM, mode: 'unmoderated_caucus' as const };

		expect(liveStripControls(unmod)).toEqual({
			clock: { label: 'Pause', formAction: '?/timerPause' },
			addTime: { label: '+1 min', seconds: 60 },
			primary: { label: 'End caucus', action: 'endCaucus' }
		});
	});
});

describe('stripNextSpeaker and hasPresentSeatWaiting', () => {
	it('skip a seat marked absent', () => {
		expect(stripNextSpeaker(GSL_ROOM)?.seat.name).toBe('Brazil');
		expect(hasPresentSeatWaiting(GSL_ROOM)).toBe(true);
	});

	it('find nobody when only absent seats wait', () => {
		const onlyAbsent = { ...GSL_ROOM, entries: GSL_ROOM.entries.slice(0, 2) };

		expect(stripNextSpeaker(onlyAbsent)).toBeNull();
		expect(hasPresentSeatWaiting(onlyAbsent)).toBe(false);
	});
});

describe('readShortcutsSetting and shortcutsSettingValue', () => {
	it('keeps the shortcuts on until they are switched off', () => {
		expect(readShortcutsSetting(null)).toBe(true);
		expect(readShortcutsSetting(shortcutsSettingValue(true))).toBe(true);
		expect(readShortcutsSetting(shortcutsSettingValue(false))).toBe(false);
	});
});

/** A stand-in for the focused element, with only what `keyTargetOf` reads. */
function focused(
	tagName: string,
	attributes: Record<string, string> = {},
	extra: Partial<FocusedElement> = {}
): FocusedElement {
	return {
		tagName,
		getAttribute: (name) => attributes[name] ?? null,
		closest: () => null,
		...extra
	};
}

describe('keyTargetOf', () => {
	it('is the body when nothing has the focus', () => {
		expect(keyTargetOf(null)).toEqual({
			tagName: 'BODY',
			role: null,
			inputType: null,
			isContentEditable: false,
			isDragHandle: false,
			isAddBox: false,
			isEmpty: true
		});
	});

	it('knows a list’s add box by the "/" it declares, and whether it holds text', () => {
		const addBox = focused('input', { 'aria-keyshortcuts': '/', role: 'combobox' }, { value: '' });
		const typedInto = focused('INPUT', { 'aria-keyshortcuts': '/' }, { value: 'fra' });

		expect(keyTargetOf(addBox)).toMatchObject({
			tagName: 'INPUT',
			role: 'combobox',
			inputType: null,
			isAddBox: true,
			isEmpty: true
		});
		expect(keyTargetOf(typedInto)).toMatchObject({ isAddBox: true, isEmpty: false });
	});

	it("reads an input's type, an editable area and a drag handle", () => {
		const stepper = focused('INPUT', { type: 'number' }, { value: '3' });
		const editable = focused('DIV', {}, { isContentEditable: true });
		const handle = focused('BUTTON', {}, { closest: () => ({}) });

		expect(keyTargetOf(stepper)).toMatchObject({ inputType: 'number', isAddBox: false });
		expect(keyTargetOf(editable).isContentEditable).toBe(true);
		expect(keyTargetOf(handle).isDragHandle).toBe(true);
	});
});

describe('consoleFrame', () => {
	const LIST = {
		id: 'list-1',
		name: "General Speakers' List",
		speakingTimeSeconds: 90,
		isOpen: true
	};

	/** The layout's data: Session 1 in formal debate, China speaking, Brazil waiting. */
	function consoleData(changes: Partial<ConsoleData> = {}): ConsoleData {
		const frame = frameWith({ currentSpeakerEntryId: 'entry-cn', agendaTopic: 'Water' });

		return {
			conference: { slug: 'thimun-2027', timezone: 'Europe/Amsterdam' },
			committee: { slug: 'unsc', topics: ['Water'], defaultSpeakingTimeSeconds: 60 },
			committeeState: frame.committeeState,
			currentSession: RUNNING,
			currentMotion: null,
			sessions: [RUNNING],
			seats: [CHINA, BRAZIL],
			attendance: {},
			latestRollCallId: 'roll-call-1',
			today: '2020-05-05',
			motionsOnFloorCount: 2,
			hasAnyoneSpoken: true,
			liveList: {
				speakersList: LIST,
				speakers: [entry('entry-cn', CHINA, 1, 'speaking'), entry('entry-br', BRAZIL, 2, 'waiting')]
			},
			...changes
		};
	}

	it('draws the mode bar, with the dot on GSL and the count on Motions, while in debate', () => {
		const shown = consoleFrame(consoleData(), 'chair', [], []);

		expect(shown.roomState).toBe('debate');
		expect(shown.isModeBarShown).toBe(true);
		expect(shown.isSuspendShown).toBe(true);
		expect(shown.tabs.map((tab) => tab.view)).toEqual([
			'gsl',
			'motions',
			'mod',
			'unmod',
			'single',
			'voting'
		]);
		expect(shown.tabs.find((tab) => tab.isLive)?.view).toBe('gsl');
		expect(shown.tabs.find((tab) => tab.view === 'motions')?.count).toBe(2);
	});

	it('draws no live strip on the live room, and draws it on another view', () => {
		expect(consoleFrame(consoleData(), 'chair', [], []).liveStrip).toBeNull();
		expect(consoleFrame(consoleData(), 'gsl', [], []).liveStrip).toBeNull();
		expect(consoleFrame(consoleData(), 'motions', [], []).liveStrip?.entries).toHaveLength(2);
	});

	it('draws no live strip for a vote or while suspended', () => {
		const voting = consoleData({
			committeeState: { ...consoleData().committeeState, mode: 'voting' }
		});
		const suspended = consoleData({
			committeeState: { ...consoleData().committeeState, mode: 'suspended' }
		});

		expect(consoleFrame(voting, 'motions', [], []).liveStrip).toBeNull();
		expect(consoleFrame(suspended, 'motions', [], []).liveStrip).toBeNull();
		expect(consoleFrame(suspended, 'motions', [], []).isSuspendShown).toBe(false);
	});

	it('draws no live strip while the list has nobody speaking and nobody present waiting', () => {
		const empty = consoleData({
			committeeState: { ...consoleData().committeeState, currentSpeakerEntryId: null },
			liveList: { speakersList: LIST, speakers: [] }
		});

		expect(consoleFrame(empty, 'motions', [], []).liveStrip).toBeNull();
	});

	it('leaves the mode bar out in the lobby', () => {
		const lobby = consoleData({
			committeeState: { ...consoleData().committeeState, mode: 'idle', currentSessionId: null },
			currentSession: null,
			sessions: []
		});

		expect(consoleFrame(lobby, 'chair', [], []).roomState).toBe('lobby');
		expect(consoleFrame(lobby, 'chair', [], []).isModeBarShown).toBe(false);
	});

	it('moves the dot and the strip the moment a press changes the live mode', () => {
		const suspend = {
			id: 1,
			formData: new FormData(),
			action: new URL('http://localhost/chair?/suspend'),
			expected: { state: { mode: 'suspended' as const } }
		};

		const shown = consoleFrame(consoleData(), 'motions', [suspend], []);

		expect(shown.roomState).toBe('suspended');
		expect(shown.tabs.some((tab) => tab.isLive)).toBe(false);
		expect(shown.liveStrip).toBeNull();
	});

	it('posts the frame’s forms from the page the chair is on', () => {
		const shown = consoleFrame(consoleData(), 'motions', [], []);

		expect(shown.links.setAgendaAction).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/setAgenda'
		);
	});

	it('keeps the roll call view’s own way back on its attendance chip', () => {
		const shown = consoleFrame(consoleData(), 'roll-call', [], [], 'mod');

		expect(shown.links.rollCallHref).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/roll-call?from=mod'
		);
	});

	it('gives Suspend and End the room as shown, and End’s links with and without the question', () => {
		const shown = consoleFrame(consoleData(), 'motions', [], []);
		const onAskToEnd = () => {};
		const onKeepGoing = () => {};
		const url = new URL('http://localhost/conferences/thimun-2027/committees/unsc/chair/motions');

		const controls = sessionControlsOf(shown, {
			clockOffsetMs: 250,
			isConfirming: false,
			url,
			onAskToEnd,
			onKeepGoing
		});

		expect(controls.committeeState).toBe(shown.frame.committeeState);
		expect(controls.session).toBe(shown.frame.currentSession);
		expect(controls.clockOffsetMs).toBe(250);
		expect(controls.suspendAction).toBe(
			'/conferences/thimun-2027/committees/unsc/chair?fromView=motions&/suspend'
		);
		expect(controls.confirmHref).toBe(
			'/conferences/thimun-2027/committees/unsc/chair/motions?end=confirm'
		);
		expect(controls.cancelHref).toBe('/conferences/thimun-2027/committees/unsc/chair/motions');
		expect(controls.onAskToEnd).toBe(onAskToEnd);
	});
});

describe('committeeToolsFor', () => {
	it('opens each page by its own permission in the committee', () => {
		const coChair = {
			held: [
				{ permission: 'run_room' as const, scope: 'committees' as const },
				{ permission: 'review_papers' as const, scope: 'committees' as const }
			],
			committeeIds: ['unsc'],
			rank: 3
		};

		expect(committeeToolsFor(coChair, 'unsc')).toEqual({
			mayReviewPapers: true,
			mayWriteNotes: false,
			mayProposeAwards: false
		});
		expect(committeeToolsFor(coChair, 'who').mayReviewPapers).toBe(false);
	});
});
