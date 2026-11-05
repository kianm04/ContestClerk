// @vitest-environment jsdom
// (The line above gives this file a browser's `document` and `window`, which
// the instant form marks a sending form with; the rest of the file needs none.)
import { describe, expect, it, vi } from 'vitest';
import type { CommitteeStateView, RoomSpeaker, SpeakersListSummary } from '$lib/chair-room';
import { CLEARED_TIMER, type RoomSeat } from '$lib/committee-room';
import { applyAction } from '$app/forms';
import { createInstantForm } from '$lib/instant-form.svelte';
import { readNewRowId } from '$lib/new-row-id';
import {
	chairPageOf,
	createChairForm,
	describeChairFailure,
	expectationsOf,
	newRowId,
	roomFrameAfterPresses,
	rowsAfterChanges,
	sharedChairForm,
	shareChairForm,
	speakersAfterPresses,
	speakersListAfterPresses,
	type ChairExpectation,
	type ChairPress,
	type RoomFrame
} from './chair-form';

// Svelte's context only exists while a component is being set up, so these
// tests keep it in a plain map instead, which is all the two functions rely on.
const fakeContext = vi.hoisted(() => new Map<unknown, unknown>());
vi.mock('svelte', () => ({
	setContext: (key: unknown, value: unknown) => fakeContext.set(key, value),
	getContext: (key: unknown) => fakeContext.get(key)
}));
// The instant form reads SvelteKit's browser modules, which only work inside a running app.
vi.mock('$app/forms', () => ({ applyAction: vi.fn(async () => undefined) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => undefined), goto: vi.fn() }));
vi.mock('$app/state', () => ({ navigating: { complete: null } }));

const FRANCE: RoomSeat = { id: 'seat-france', name: 'France', countryCode: 'FR' };
const GHANA: RoomSeat = { id: 'seat-ghana', name: 'Ghana', countryCode: 'GH' };

const ENTRIES: RoomSpeaker[] = [
	{ id: 'entry-france', position: 1, status: 'waiting', seat: FRANCE },
	{ id: 'entry-ghana', position: 2, status: 'waiting', seat: GHANA }
];

/** A press made on the chair page `page`, such as `chair` or `motions`. */
function chairPress(
	action: string,
	expected: ChairExpectation | null,
	page = 'chair',
	id = 1
): ChairPress {
	const address = `http://localhost/conferences/mun/committees/ga/${page}`;

	return { id, formData: new FormData(), action: new URL(action, address), expected };
}

describe('rowsAfterChanges', () => {
	it('adds a new row once, even when the saved row is already there', () => {
		const added = { id: 'entry-new', position: 3, status: 'waiting' as const, seat: FRANCE };
		const change = { id: 'entry-new', added };

		const shown = rowsAfterChanges(ENTRIES, [change]);
		const shownAgain = rowsAfterChanges(shown, [change]);

		expect(shown).toHaveLength(3);
		expect(shownAgain).toEqual(shown);
	});

	it('sets fields on a row and takes a deleted row away', () => {
		const shown = rowsAfterChanges(ENTRIES, [
			{ id: 'entry-france', changes: { status: 'speaking' } },
			{ id: 'entry-ghana', isDeleted: true }
		]);

		expect(shown).toEqual([{ ...ENTRIES[0], status: 'speaking' }]);
	});

	it('leaves out a change to a row that is not there', () => {
		expect(rowsAfterChanges(ENTRIES, [{ id: 'gone', changes: { position: 9 } }])).toEqual(ENTRIES);
	});
});

describe('speakersAfterPresses', () => {
	it('lays on the changes to this list only', () => {
		const presses = [
			chairPress('?/remove', {
				speakers: [
					{ listId: 'list-1', id: 'entry-france', changes: { status: 'removed' } },
					{ listId: 'list-2', id: 'entry-ghana', changes: { status: 'removed' } }
				]
			}),
			chairPress('?/timerReset', null)
		];

		const shown = speakersAfterPresses(ENTRIES, 'list-1', presses);

		expect(shown.map((entry) => entry.status)).toEqual(['removed', 'waiting']);
	});
});

describe('speakersListAfterPresses', () => {
	it('gives the list with its settings changed', () => {
		const list: SpeakersListSummary = {
			id: 'list-1',
			name: 'General Speakers’ List',
			speakingTimeSeconds: 90,
			isOpen: true
		};
		const presses = [
			chairPress('?/closeList', { speakersLists: [{ id: 'list-1', changes: { isOpen: false } }] })
		];

		expect(speakersListAfterPresses(list, presses)).toEqual({ ...list, isOpen: false });
	});
});

describe('roomFrameAfterPresses', () => {
	const committeeState: CommitteeStateView = {
		currentSessionId: 'session-1',
		mode: 'formal_debate',
		currentMotionId: null,
		activeSpeakersListId: 'list-1',
		currentSpeakerEntryId: null,
		currentVoteId: null,
		agendaTopic: null,
		timer: CLEARED_TIMER
	};
	const frame: RoomFrame = {
		committeeState,
		currentSession: {
			id: 'session-1',
			name: 'Session 1',
			status: 'in_progress',
			startedAt: null,
			endedAt: null
		},
		currentMotion: null
	};

	it('lays each press’s state over the last, oldest first', () => {
		const presses = [
			chairPress('?/suspend', { state: { mode: 'suspended' } }, 'chair', 1),
			chairPress('?/setAgenda', { state: { agendaTopic: 'Water' } }, 'chair', 2),
			chairPress('?/resume', { state: { mode: 'formal_debate' } }, 'chair', 3)
		];

		const shown = roomFrameAfterPresses(frame, presses);

		expect(shown.committeeState.mode).toBe('formal_debate');
		expect(shown.committeeState.agendaTopic).toBe('Water');
		expect(shown.currentSession).toBe(frame.currentSession);
	});

	it('clears the session when a press says there will be none', () => {
		const presses = [chairPress('?/endSession', { currentSession: null })];

		expect(roomFrameAfterPresses(frame, presses).currentSession).toBeNull();
	});
});

describe('chairPageOf', () => {
	it('names the chair page by the last part of its address', () => {
		expect(chairPageOf(chairPress('?/propose', null, 'motions'))).toBe('motions');
		expect(chairPageOf(chairPress('?/nextSpeaker', null))).toBe('chair');
	});
});

describe('expectationsOf', () => {
	it('lists the expectations oldest first and skips presses that carry none', () => {
		const first: ChairExpectation = { state: { agendaTopic: 'Water' } };
		const second: ChairExpectation = { currentMotion: null };
		const presses = [
			chairPress('?/setAgenda', first, 'chair', 1),
			chairPress('?/timerStart', null, 'chair', 2),
			chairPress('?/endCaucus', second, 'chair', 3)
		];

		expect(expectationsOf(presses)).toEqual([first, second]);
	});
});

describe('newRowId', () => {
	it('makes a different id each time, in the shape the server accepts', () => {
		const first = newRowId();

		expect(first).not.toBe(newRowId());
		expect(readNewRowId(first)).toBe(first);
	});
});

describe('describeChairFailure', () => {
	it('names the action of the page it was pressed on', () => {
		expect(describeChairFailure(chairPress('?/propose', null, 'motions'))).toBe(
			'The motion was not recorded.'
		);
		expect(describeChairFailure(chairPress('?/propose', null, 'awards'))).toBe(
			'The award was not proposed.'
		);
	});

	it('names the seat of a roll call vote’s answer, on the Vote view and on the live room', () => {
		const press = chairPress('?/castRollCall', null, 'voting');
		press.formData.set('seatId', FRANCE.id);
		const cleared = chairPress('?/clearRollCall', null, 'chair');
		cleared.formData.set('seatId', GHANA.id);

		expect(describeChairFailure(press, [FRANCE, GHANA])).toBe('France’s vote was not recorded.');
		expect(describeChairFailure(cleared, [FRANCE, GHANA])).toBe('Ghana’s vote was not cleared.');
	});

	it('says "The seat" for a roll call answer whose seat it cannot find', () => {
		expect(describeChairFailure(chairPress('?/castRollCall', null, 'voting'))).toBe(
			'The seat’s vote was not recorded.'
		);
	});

	it('names the vote’s own actions by the same words on the Vote view and the live room', () => {
		expect(describeChairFailure(chairPress('?/openVote', null, 'voting'))).toBe(
			'The vote was not opened.'
		);
		expect(describeChairFailure(chairPress('?/closeVote', null, 'chair'))).toBe(
			'The vote was not closed.'
		);
		expect(describeChairFailure(chairPress('?/cancelVote', null, 'chair'))).toBe(
			'The vote was not cancelled.'
		);
	});

	it('names Suspend, the return time and Resume, which post to the live room from any page', () => {
		expect(describeChairFailure(chairPress('?fromView=motions&/suspend', null))).toBe(
			'The session was not suspended.'
		);
		expect(describeChairFailure(chairPress('?/setReturnTime', null))).toBe(
			'The return time was not set.'
		);
		expect(describeChairFailure(chairPress('?/resume', null))).toBe('The session was not resumed.');
	});

	it('names the action when the page’s address carries a filter or a chosen seat', () => {
		expect(describeChairFailure(chairPress('?status=submitted&/approve', null, 'papers'))).toBe(
			'The paper was not approved.'
		);
		expect(describeChairFailure(chairPress('?seat=seat-1&/add', null, 'notes'))).toBe(
			'The note was not saved.'
		);
	});

	it('names a floor action the same way on every page', () => {
		expect(describeChairFailure(chairPress('?/nextSpeaker', null, 'speakers'))).toBe(
			'The next speaker was not called.'
		);
	});

	it("names the GSL view's list and floor actions on the view and on the live room", () => {
		expect(describeChairFailure(chairPress('?/speakNow', null, 'gsl'))).toBe(
			'The speaker was not given the floor.'
		);
		expect(describeChairFailure(chairPress('?/setSpeakingTime', null, 'chair'))).toBe(
			'The speaking time was not changed.'
		);
		expect(describeChairFailure(chairPress('?/closeList', null, 'gsl'))).toBe(
			'The list was not closed.'
		);
		expect(describeChairFailure(chairPress('?/openList', null, 'chair'))).toBe(
			'The list was not opened.'
		);
	});

	it('names a press the live strip sent from another view, by its action', () => {
		expect(describeChairFailure(chairPress('?fromView=motions&/timerPause', null))).toBe(
			'The timer was not paused.'
		);
	});

	it('falls back to a general sentence for an action it does not know', () => {
		expect(describeChairFailure(chairPress('?/somethingNew', null))).toBe(
			'That change was not saved.'
		);
	});
});

describe('createChairForm', () => {
	it('names the seat of a roll call vote answer that failed, from the seats it is given', async () => {
		const form = createChairForm(() => [FRANCE, GHANA]);
		const formData = new FormData();
		formData.set('seatId', FRANCE.id);
		const action = new URL('http://localhost/conferences/mun/committees/ga/chair?/castRollCall');
		const formElement = document.createElement('form');
		const input = {
			action,
			formData,
			formElement,
			controller: new AbortController(),
			submitter: null,
			cancel: vi.fn()
		};

		// What `use:enhance` does: hand the press over, then the server's answer.
		const answer = await form.submit(input);
		if (typeof answer !== 'function') throw new Error('The press was not sent.');
		await answer({
			action,
			formData,
			formElement,
			result: { type: 'failure', status: 400, data: {} },
			update: vi.fn()
		});

		const shownFlash = vi.mocked(applyAction).mock.lastCall?.[0];
		expect(shownFlash).toMatchObject({
			type: 'failure',
			data: {
				flash: {
					tone: 'error',
					message: expect.stringMatching(/^France’s vote was not recorded\. /)
				}
			}
		});
	});
});

describe('sharing the chair form', () => {
	it('gives every component the form the layout shared', () => {
		fakeContext.clear();
		const form = createInstantForm<ChairExpectation>({ describeFailure: describeChairFailure });

		shareChairForm(form);

		expect(sharedChairForm()).toBe(form);
	});

	it('makes a form of its own outside the chair pages', () => {
		fakeContext.clear();

		expect(sharedChairForm().presses).toEqual([]);
	});
});
