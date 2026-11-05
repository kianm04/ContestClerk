import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { END_SESSION_KEEP_GOING_ID, type SessionControls } from '$lib/chair-frame';
import { CLEARED_TIMER } from '$lib/committee-room';
import MenuSessionControls from './MenuSessionControls.svelte';

const ROOM = '/conferences/thimun-2027/committees/unsc/chair';

/** Suspend and End for Session 1, nothing asked yet. */
function controls(changes: Partial<SessionControls> = {}): SessionControls {
	return {
		session: {
			id: 'session-1',
			name: 'Session 1',
			status: 'in_progress',
			startedAt: '2027-03-12T08:00:00Z',
			endedAt: null
		},
		committeeState: {
			currentSessionId: 'session-1',
			mode: 'formal_debate',
			currentMotionId: null,
			activeSpeakersListId: 'gsl',
			currentSpeakerEntryId: null,
			currentVoteId: null,
			agendaTopic: null,
			timer: CLEARED_TIMER
		},
		clockOffsetMs: 0,
		isSuspendShown: true,
		isConfirming: false,
		suspendAction: `${ROOM}?/suspend`,
		endSessionAction: `${ROOM}?/endSession`,
		confirmHref: `${ROOM}?end=confirm`,
		cancelHref: ROOM,
		onAskToEnd: vi.fn(),
		onKeepGoing: vi.fn(),
		...changes
	};
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('MenuSessionControls', () => {
	it('posts Suspend to the live room, and links End to its confirmation without JavaScript', () => {
		render(MenuSessionControls, { props: { controls: controls(), onPress: vi.fn() } });

		expect(
			screen.getByRole('button', { name: 'Suspend' }).closest('form')?.getAttribute('action')
		).toBe(`${ROOM}?/suspend`);
		expect(screen.getByRole('link', { name: 'End' }).getAttribute('href')).toBe(
			`${ROOM}?end=confirm`
		);
	});

	it('asks in place when End is pressed, folds the menu away and puts the focus on "Keep going"', async () => {
		const onAskToEnd = vi.fn();
		const onPress = vi.fn();
		render(MenuSessionControls, { props: { controls: controls({ onAskToEnd }), onPress } });
		// The confirmation `SessionEndControl` draws once asked, with its "Keep going".
		const keepGoing = document.createElement('a');
		keepGoing.id = END_SESSION_KEEP_GOING_ID;
		keepGoing.href = ROOM;
		document.body.append(keepGoing);

		await fireEvent.click(screen.getByRole('link', { name: 'End' }));
		await tick();

		expect(onPress).toHaveBeenCalledOnce();
		expect(onAskToEnd).toHaveBeenCalledOnce();
		expect(document.activeElement).toBe(keepGoing);
	});

	it('leaves Suspend out while the room is suspended', () => {
		render(MenuSessionControls, {
			props: { controls: controls({ isSuspendShown: false }), onPress: vi.fn() }
		});

		expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
		expect(screen.getByRole('link', { name: 'End' })).toBeTruthy();
	});
});
